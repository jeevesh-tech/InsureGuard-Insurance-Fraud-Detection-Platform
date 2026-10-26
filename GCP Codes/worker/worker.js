const express = require("express");
const { Pool } = require("pg");
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai");
const { Storage } = require("@google-cloud/storage");
const { createClient } = require("redis");

const app = express();
const PORT = Number(process.env.PORT || 8080);

const VERTEX_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "jeevesh-510707";
const VERTEX_REGION = process.env.VERTEX_REGION || "us-west1";
const VERTEX_ENDPOINT_ID = process.env.VERTEX_ENDPOINT_ID || "2528008129698856960";


const documentAi = new DocumentProcessorServiceClient();
const storage = new Storage();

const DOCUMENT_AI_PROJECT = process.env.DOCUMENT_AI_PROJECT || "jeevesh-510707";
const DOCUMENT_AI_LOCATION = process.env.DOCUMENT_AI_LOCATION || "us";
const DOCUMENT_AI_PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;
const GCS_BUCKET = process.env.GCS_BUCKET || "insureguard-claims-jeevesh";

const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379)
  }
});

redis.on("error", err => {
  console.error("Redis error:", err);
});

const redisReady = redis.connect().catch(err => {
  console.error("Redis connection failed:", err);
});

app.use(express.json({ limit: "1mb" }));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "insureguard",
  user: process.env.DB_USER || "insureguard_app",
  password: process.env.DB_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});



async function predictFraudWithVertexAI(features) {
  const metadataUrl =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

  const tokenResponse = await fetch(metadataUrl, {
    headers: { "Metadata-Flavor": "Google" }
  });

  if (!tokenResponse.ok) {
    throw new Error(`Could not obtain Google Cloud token: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  const url =
    `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/` +
    `${VERTEX_PROJECT_ID}/locations/${VERTEX_REGION}/endpoints/` +
    `${VERTEX_ENDPOINT_ID}:predict`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ instances: [features] })
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Vertex AI prediction failed (${response.status}): ${JSON.stringify(body)}`
    );
  }

  const prediction = body.predictions?.[0];

  if (
    !prediction ||
    !Number.isFinite(Number(prediction.fraud_probability)) ||
    !Number.isFinite(Number(prediction.predicted_label))
  ) {
    throw new Error(`Unexpected Vertex AI response: ${JSON.stringify(body)}`);
  }

  return {
    mlScore: Math.round(Number(prediction.fraud_probability) * 10000) / 100,
    predictedLabel: Number(prediction.predicted_label)
  };
}

async function processDocument(document) {
  if (!DOCUMENT_AI_PROCESSOR_ID) {
    throw new Error("DOCUMENT_AI_PROCESSOR_ID is not configured");
  }

  const file = storage
    .bucket(document.storage_bucket || GCS_BUCKET)
    .file(document.storage_object);

  const [fileBytes] = await file.download();

  const processorName =
    `projects/${DOCUMENT_AI_PROJECT}/locations/${DOCUMENT_AI_LOCATION}` +
    `/processors/${DOCUMENT_AI_PROCESSOR_ID}`;

  const [result] = await documentAi.processDocument({
    name: processorName,
    rawDocument: {
      content: fileBytes,
      mimeType: document.content_type
    }
  });

  const text = result.document?.text || "";

  return {
    text,
    pageCount: result.document?.pages?.length || 0
  };
}


async function processClaimDocuments(claimId) {
  const documentsResult = await pool.query(
    `SELECT document_id, claim_id, document_type, file_name,
            content_type, storage_bucket, storage_object,
            processing_status
       FROM insureguard.claim_documents
      WHERE claim_id = $1
      ORDER BY uploaded_at ASC`,
    [claimId]
  );

  const documents = documentsResult.rows;

  if (documents.length === 0) {
    console.log(`No documents found for claim ${claimId}`);
    return {
      documentCount: 0,
      processedCount: 0
    };
  }

  let processedCount = 0;
  let skippedCount = 0;

  for (const document of documents) {
    if (document.processing_status === "PROCESSED") {
      processedCount += 1;
      console.log(
        `Document ${document.file_name} is already processed; skipping`
      );
      continue;
    }

    try {
      await pool.query(
        `UPDATE insureguard.claim_documents
            SET processing_status = 'PROCESSING',
                document_ai_status = 'PROCESSING'
          WHERE document_id = $1`,
        [document.document_id]
      );

      console.log(
        `Processing document ${document.file_name} for claim ${claimId}`
      );

      const result = await processDocument(document);

      await pool.query(
        `UPDATE insureguard.claim_documents
            SET processing_status = 'PROCESSED',
                document_ai_status = 'SUCCESS',
                processed_at = NOW()
          WHERE document_id = $1`,
        [document.document_id]
      );

      await pool.query(
        `INSERT INTO insureguard.claim_events
          (claim_id, event_type, status, title, description, source, metadata)
         VALUES
          ($1,
           'DOCUMENT_PROCESSED',
           'DOCUMENT_PROCESSING',
           'Documents processed',
           'Text and details were successfully read from the uploaded files.',
           'DOCUMENT_AI',
           $2::jsonb)`,
        [
          claimId,
          JSON.stringify({
            document_id: document.document_id,
            file_name: document.file_name,
            document_type: document.document_type,
            page_count: result.pageCount,
            extracted_text: result.text
          })
        ]
      );

      processedCount += 1;

      console.log(
        `Document ${document.file_name} processed successfully`
      );
    } catch (err) {
      await pool.query(
        `UPDATE insureguard.claim_documents
            SET processing_status = 'FAILED',
                document_ai_status = 'FAILED'
          WHERE document_id = $1`,
        [document.document_id]
      );

      // 404 = file never reached GCS (frontend upload failed).
      // Skip this document — don't crash the whole pipeline.
      const isNotFound =
        err.code === 404 ||
        err?.errors?.[0]?.code === 404 ||
        String(err.message).includes("404");

      if (isNotFound) {
        console.warn(
          `[Worker] GCS 404 for ${document.file_name} — upload failed; skipping`
        );
        skippedCount += 1;
        continue;
      }

      console.error(
        `Document processing failed for ${document.file_name}:`,
        err
      );

      throw err;
    }
  }

  return {
    documentCount: documents.length,
    processedCount,
    skippedCount
  };
}


async function getRedisCustomerClaimsLast30Days(customerId, claimId, reportedDate) {
  await redisReady;

  const key = `claims:customer:${customerId}:30d`;
  const timestamp = new Date(reportedDate).getTime();
  const cutoff = timestamp - (30 * 24 * 60 * 60 * 1000);

  await redis.zRemRangeByScore(key, "0", String(cutoff));
  await redis.zAdd(key, [
    {
      score: timestamp,
      value: claimId
    }
  ]);

  await redis.expire(key, 60 * 60 * 24 * 31);

  return await redis.zCard(key);
}

async function acquireClaimLock(claimId) {
  const client = await pool.connect();

  try {
    const lockKey = `insureguard:${claimId}`;
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lockKey]
    );

    if (!result.rows[0].acquired) {
      client.release();
      return null;
    }

    return {
      client,
      release: async () => {
        try {
          const result = await client.query(
            "SELECT pg_advisory_unlock(hashtext($1)) AS unlocked",
            [lockKey]
          );

          if (!result.rows[0].unlocked) {
            throw new Error(`Advisory lock was not held for ${lockKey}`);
          }

          client.release();
        } catch (err) {
          // Destroy a connection if its lock state cannot be confirmed.
          client.release(err);
          throw err;
        }
      }
    };
  } catch (err) {
    client.release();
    throw err;
  }
}

async function analyzeFraud(claimId) {
  const result = await pool.query(
    `
    SELECT
      c.claim_id,
      c.claim_number,
      c.claim_type,
      c.description,
      c.policy_id,
      c.vehicle_id,
      c.claim_amount,
      c.incident_date,
      c.reported_date,
      p.policy_number,
      p.customer_id,
      p.start_date,
      p.coverage_limit,

      (
        SELECT metadata->>'extracted_text'
        FROM insureguard.claim_events
        WHERE claim_id = c.claim_id
          AND event_type = 'DOCUMENT_PROCESSED'
          AND metadata ? 'extracted_text'
        ORDER BY created_at DESC
        LIMIT 1
      ) AS extracted_document_text,


      (
        SELECT COUNT(*)
        FROM insureguard.claims c2
        JOIN insureguard.policies p2
          ON p2.policy_id = c2.policy_id
        WHERE p2.customer_id = p.customer_id
          AND c2.reported_date >= c.reported_date - INTERVAL '30 days'
          AND c2.reported_date <= c.reported_date
      ) AS claims_last_30_days,

      (
        SELECT COUNT(*)
        FROM insureguard.claims c3
        WHERE c3.vehicle_id = c.vehicle_id
          AND c3.claim_id <> c.claim_id
      ) AS prior_vehicle_claims,

      EXISTS (
        SELECT 1
        FROM insureguard.investigations i
        JOIN insureguard.claims ic
          ON ic.claim_id = i.claim_id
        JOIN insureguard.policies ip
          ON ip.policy_id = ic.policy_id
        WHERE ip.customer_id = p.customer_id
          AND ic.claim_id <> c.claim_id
      ) AS previous_investigation

    FROM insureguard.claims c
    JOIN insureguard.policies p
      ON p.policy_id = c.policy_id
    WHERE c.claim_id = $1
    `,
    [claimId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Claim ${claimId} not found`);
  }

  const claim = result.rows[0];

  let ruleScore = 0;
  const rulesTriggered = [];

  const claimsLast30Days = Number(claim.claims_last_30_days);
  const priorVehicleClaims = Number(claim.prior_vehicle_claims);
  const claimAmount = Number(claim.claim_amount);

    // Coverage and document consistency are review controls,
    // separate from the fraud-risk score.
    const coverageLimit = Number(claim.coverage_limit);
    const reviewReasons = [];

    if (
      Number.isFinite(coverageLimit) &&
      coverageLimit > 0 &&
      claimAmount > coverageLimit
    ) {
      reviewReasons.push({
        rule: "CLAIM_EXCEEDS_COVERAGE",
        claim_amount: claimAmount,
        coverage_limit: coverageLimit
      });
    }

    const extractedText = String(claim.extracted_document_text || "");
    const documentClaimNumbers =
      extractedText.match(/\bCLM-\d{4}-[A-Z0-9]+\b/gi) || [];

    // Flag clear loss-type contradictions for human review.
    const reportedLoss = String(
      `${claim.claim_type || ""} ${claim.description || ""}`
    ).toLowerCase();

    const documentTextLower = extractedText.toLowerCase();

    const reportedTheft =
      /\b(theft|stolen|stolen vehicle|vehicle theft)\b/.test(reportedLoss);

    const documentCollision =
      /\b(collision|collision repair|accident damage|vehicle collision)\b/.test(
        documentTextLower
      );

    const reportedCollision =
      /\b(collision|collision repair|vehicle collision|accident damage)\b/.test(
        reportedLoss
      );

    const documentTheft =
      /\b(theft|stolen|vehicle theft)\b/.test(documentTextLower);

    if (
      (reportedTheft && documentCollision) ||
      (reportedCollision && documentTheft)
    ) {
      reviewReasons.push({
        rule: "DOCUMENT_LOSS_TYPE_MISMATCH",
        reported_loss: reportedLoss.slice(0, 300),
        document_conflicting_terms: {
          collision: documentCollision,
          theft: documentTheft
        }
      });
    }

    const normalizedClaimNumber =
      String(claim.claim_number || "").toUpperCase();

    if (
      documentClaimNumbers.some(
        number => number.toUpperCase() !== normalizedClaimNumber
      )
    ) {
      reviewReasons.push({
        rule: "DOCUMENT_CLAIM_NUMBER_MISMATCH",
        submitted_claim_number: normalizedClaimNumber,
        document_claim_numbers: documentClaimNumbers
      });
    }


  const redisClaimsLast30Days = await getRedisCustomerClaimsLast30Days(
    claim.customer_id,
    claim.claim_id,
    claim.reported_date
  );

  console.log(
    `Redis customer claim signal for ${claim.claim_id}: ${redisClaimsLast30Days} claims in last 30 days`
  );

  if (claimsLast30Days > 3) {
    ruleScore += 20;
    rulesTriggered.push({
      rule: "CLAIMS_OVER_3_IN_30_DAYS",
      score: 20,
      value: claimsLast30Days
    });
  }

  if (priorVehicleClaims >= 1) {
    ruleScore += 20;
    rulesTriggered.push({
      rule: "MULTIPLE_CLAIMS_SAME_VEHICLE",
      score: 20,
      value: priorVehicleClaims
    });
  }

  if (claimAmount > 10000) {
    ruleScore += 15;
    rulesTriggered.push({
      rule: "HIGH_CLAIM_AMOUNT",
      score: 15,
      value: claimAmount
    });
  }

  const incidentDate = new Date(claim.incident_date);
  const policyStartDate = new Date(claim.start_date);

  const daysSincePolicyStart =
    Math.floor(
      (incidentDate.getTime() - policyStartDate.getTime()) /
      (1000 * 60 * 60 * 24)
    );

  if (daysSincePolicyStart >= 0 && daysSincePolicyStart <= 30) {
    ruleScore += 20;
    rulesTriggered.push({
      rule: "RECENTLY_ACTIVATED_POLICY",
      score: 20,
      value: daysSincePolicyStart
    });
  }

  if (claim.previous_investigation) {
    ruleScore += 25;
    rulesTriggered.push({
      rule: "PREVIOUS_FRAUD_INVESTIGATION",
      score: 25,
      value: true
    });
  }

  const finalScore = Math.min(ruleScore, 100);

  let riskLevel;
  let decision;

  if (finalScore >= 50) {
    riskLevel = "HIGH";
    decision = "FRAUD_REVIEW";
  } else if (finalScore >= 25) {
    riskLevel = "MEDIUM";
    decision = "ADDITIONAL_REVIEW";
  } else {
    riskLevel = "LOW";
    decision = "ADDITIONAL_REVIEW";
  }

  // Coverage and document checks override routine processing,
  // but do not change the fraud-risk score.
  if (reviewReasons.length > 0 && riskLevel !== "HIGH") {
    decision = "ADDITIONAL_REVIEW";
  }

  const featureSnapshot = {
    claim_amount: claimAmount,
    claims_last_30_days: claimsLast30Days,
    redis_claims_last_30_days: redisClaimsLast30Days,
    prior_vehicle_claims: priorVehicleClaims,
    days_since_policy_start: daysSincePolicyStart,
    previous_investigation: claim.previous_investigation,
    review_required: reviewReasons.length > 0,
    review_reasons: reviewReasons
  };

  let mlScore = null;
  let mlPredictionLabel = null;
  let modelName = "InsureGuard Rules Engine";
  let modelVersion = "rules-v1";

  try {
    const prediction = await predictFraudWithVertexAI({
      claim_amount: claimAmount,
      claims_last_30_days: claimsLast30Days,
      prior_vehicle_claims: priorVehicleClaims,
      days_since_policy_start: daysSincePolicyStart,
      previous_investigation: claim.previous_investigation ? 1 : 0
    });

    mlScore = prediction.mlScore;
    mlPredictionLabel = prediction.predictedLabel;
    modelName = "InsureGuard Vertex AI Random Forest";
    modelVersion = "synthetic-rf-v1";
  } catch (error) {
    console.error(
      `Vertex AI prediction failed for claim ${claimId}; using rules only: ${error.message}`
    );
  }

  const existing = await pool.query(
    `
    SELECT assessment_id
    FROM insureguard.fraud_assessments
    WHERE claim_id = $1
    ORDER BY assessed_at DESC
    LIMIT 1
    `,
    [claimId]
  );

  let assessmentId;

  if (existing.rows.length > 0) {
    assessmentId = existing.rows[0].assessment_id;

    await pool.query(
      `
      UPDATE insureguard.fraud_assessments
         SET rule_score = $1,
             ml_score = $2,
             final_score = $3,
             risk_level = $4,
             decision = $5,
             rules_triggered = $6::jsonb,
             feature_snapshot = $7::jsonb,
             model_name = $8,
             model_version = $9,
             assessed_at = NOW()
       WHERE assessment_id = $10
      `,
      [
        ruleScore,
        mlScore,
        finalScore,
        riskLevel,
        decision,
        JSON.stringify(rulesTriggered),
        JSON.stringify(featureSnapshot),
        modelName,
        modelVersion,
        assessmentId
      ]
    );
  } else {
    const inserted = await pool.query(
      `
      INSERT INTO insureguard.fraud_assessments
        (
          claim_id,
          rule_score,
          ml_score,
          final_score,
          risk_level,
          decision,
          rules_triggered,
          feature_snapshot,
          model_name,
          model_version
        )
      VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::jsonb,
          $9,
          $10
        )
      RETURNING assessment_id
      `,
      [
        claimId,
        ruleScore,
        mlScore,
        finalScore,
        riskLevel,
        decision,
        JSON.stringify(rulesTriggered),
        JSON.stringify(featureSnapshot),
        modelName,
        modelVersion
      ]
    );

    assessmentId = inserted.rows[0].assessment_id;
  }

  return {
    assessmentId,
    ruleScore,
    mlScore,
    mlPredictionLabel,
    finalScore,
    riskLevel,
    decision,
    rulesTriggered,
    featureSnapshot,
    modelName,
    modelVersion
  };
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      service: "insureguard-claim-worker",
      database: "ok"
    });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(500).json({
      status: "error",
      service: "insureguard-claim-worker",
      database: "unavailable"
    });
  }
});

app.post("/", async (req, res) => {
  let claimLock;

  try {
    const message = req.body?.message;

    if (!message?.data) {
      console.error("Missing Pub/Sub message data");
      return res.status(400).send("Missing message data");
    }

    const decoded = Buffer.from(message.data, "base64").toString("utf8");
    const event = JSON.parse(decoded);

    console.log("Received Pub/Sub event:", event);

    const claimId = event.claim_id;

    if (!claimId) {
      console.error("Missing claim_id");
      return res.status(400).send("Missing claim_id");
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof claimId !== "string" || !uuidPattern.test(claimId)) {
      console.error("Rejecting Pub/Sub event with invalid claim_id");
      return res.status(204).send();
    }

    claimLock = await acquireClaimLock(claimId);

    if (!claimLock) {
      console.warn(
        `Claim ${claimId} is already being processed by another invocation; requesting Pub/Sub retry`
      );
      return res.status(500).send("Claim is already being processed; retry later");
    }

    const claimState = await pool.query(
      `SELECT status
         FROM insureguard.claims
        WHERE claim_id = $1`,
      [claimId]
    );

    if (claimState.rows.length === 0) {
      console.error(`Claim ${claimId} not found`);
      return res.status(204).send();
    }

    const currentStatus = claimState.rows[0].status;

    if (
      currentStatus === "PROCESSING" ||
      currentStatus === "ADDITIONAL_REVIEW" ||
      currentStatus === "FRAUD_REVIEW" ||
      currentStatus === "APPROVED" ||
      currentStatus === "REJECTED"
    ) {
      console.log(
        `Claim ${claimId} is already in terminal/processed state ` +
        `(${currentStatus}); ignoring duplicate event`
      );
      return res.status(204).send();
    }

    await pool.query(
      `UPDATE insureguard.claims
          SET status = 'DOCUMENT_PROCESSING',
              updated_at = NOW()
        WHERE claim_id = $1`,
      [claimId]
    );

    const eventCheck = await pool.query(
      `SELECT 1
         FROM insureguard.claim_events
        WHERE claim_id = $1
          AND event_type = 'DOCUMENT_PROCESSING_STARTED'
        LIMIT 1`,
      [claimId]
    );

    if (eventCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO insureguard.claim_events
          (claim_id, event_type, status, title, description, source)
         VALUES
          ($1,
           'DOCUMENT_PROCESSING_STARTED',
           'DOCUMENT_PROCESSING',
           'Documents processing started',
           'Claim documents are being prepared for automated review.',
           'CLAIM_WORKER')`,
        [claimId]
      );
    }

    const result = await processClaimDocuments(claimId);

    if (result.documentCount === 0) {
      console.log(
        `No uploaded documents yet for claim ${claimId}; requesting Pub/Sub retry`
      );
      return res.status(500).send("Documents not available yet");
    }

    const attemptedCount = result.processedCount + (result.skippedCount || 0);
    if (attemptedCount !== result.documentCount) {
      console.error(`Document processing incomplete for claim ${claimId}`);
      return res.status(500).send("Document processing incomplete");
    }
    if ((result.skippedCount || 0) > 0) {
      console.warn(
        `[Worker] ${result.skippedCount} doc(s) skipped (GCS 404) for claim ${claimId}; proceeding to fraud analysis`
      );
    }

    await pool.query(
      `UPDATE insureguard.claims
          SET status = 'VALIDATING',
              updated_at = NOW()
        WHERE claim_id = $1`,
      [claimId]
    );

    await pool.query(
      `INSERT INTO insureguard.claim_events
        (claim_id, event_type, status, title, description, source, metadata)
       VALUES
        ($1,
         'DOCUMENT_PROCESSING_COMPLETED',
         'VALIDATING',
         'Documents processed',
         'Text and details were read from your uploaded files.',
         'DOCUMENT_AI',
         $2::jsonb)`,
      [
        claimId,
        JSON.stringify({
          document_count: result.documentCount,
          processed_count: result.processedCount
        })
      ]
    );

    console.log(
      `Claim ${claimId} document processing completed successfully`
    );

    await pool.query(
      `UPDATE insureguard.claims
          SET status = 'FRAUD_ANALYSIS',
              updated_at = NOW()
        WHERE claim_id = $1`,
      [claimId]
    );

    await pool.query(
      `INSERT INTO insureguard.claim_events
        (claim_id, event_type, status, title, description, source)
       VALUES
        ($1,
         'FRAUD_ANALYSIS_STARTED',
         'FRAUD_ANALYSIS',
         'Fraud analysis started',
         'Claim information is being evaluated against fraud detection rules.',
         'FRAUD_ENGINE')`,
      [claimId]
    );

    console.log(
      `Running fraud analysis for claim ${claimId}`
    );

    const fraudResult = await analyzeFraud(claimId);

    console.log(
      `Fraud analysis completed for claim ${claimId}:`,
      fraudResult
    );

    
    // Create or update a review ticket for high-risk claims.
    if (fraudResult.riskLevel === "HIGH") {
      const ticketResult = await pool.query(
        `INSERT INTO insureguard.review_tickets
          (
            claim_id,
            risk_score,
            ml_score,
            risk_level,
            decision,
            reasons,
            admin_email,
            status
          )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'OPEN')
         ON CONFLICT (claim_id)
         DO UPDATE SET
           risk_score = EXCLUDED.risk_score,
           ml_score = EXCLUDED.ml_score,
           risk_level = EXCLUDED.risk_level,
           decision = EXCLUDED.decision,
           reasons = EXCLUDED.reasons,
           updated_at = NOW()
         RETURNING ticket_id, status`,
        [
          claimId,
          fraudResult.finalScore,
          fraudResult.mlScore,
          fraudResult.riskLevel,
          fraudResult.decision,
          JSON.stringify(fraudResult.rulesTriggered || []),
          "taankjeevesh@gmail.com"
        ]
      );

      console.log(
        `High-risk review ticket created or confirmed for claim ${claimId}:`,
        ticketResult.rows[0]
      );
    }

    // Fraud risk and coverage approval are separate decisions.
    // LOW-risk claims still need coverage review.
    const nextStatus =
      fraudResult.riskLevel === "HIGH"
        ? "FRAUD_REVIEW"
        : "ADDITIONAL_REVIEW";

    await pool.query(
      `UPDATE insureguard.claims
          SET status = $1,
              fraud_score = $2,
              fraud_status = $3,
              updated_at = NOW()
        WHERE claim_id = $4`,
      [
        nextStatus,
        fraudResult.finalScore,
        fraudResult.riskLevel,
        claimId
      ]
    );

    await pool.query(
      `INSERT INTO insureguard.claim_events
        (claim_id, event_type, status, title, description, source, metadata)
       VALUES
        ($1,
         'FRAUD_ANALYSIS_COMPLETED',
         $2,
         'Risk assessment completed',
         $3,
         'FRAUD_ENGINE',
         $4::jsonb)`,
      [
        claimId,
        nextStatus,
        `Fraud analysis completed with a ${fraudResult.riskLevel} risk level.`,
        JSON.stringify({
          assessment_id: fraudResult.assessmentId,
          rule_score: fraudResult.ruleScore,
          final_score: fraudResult.finalScore,
          risk_level: fraudResult.riskLevel,
          decision: fraudResult.decision,
          rules_triggered: fraudResult.rulesTriggered,
          feature_snapshot: fraudResult.featureSnapshot
        })
      ]
    );

    console.log(
      `Claim ${claimId} fraud analysis completed: ` +
      `${fraudResult.riskLevel} (${fraudResult.finalScore})`
    );

    res.status(204).send();
  } catch (err) {
    console.error("Claim worker error:", err);
    res.status(500).send("Worker failed");
  } finally {
    if (claimLock) {
      try {
        await claimLock.release();
      } catch (lockErr) {
        console.error("Failed to release claim advisory lock:", lockErr);
      }
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`InsureGuard Claim Worker listening on port ${PORT}`);
});
