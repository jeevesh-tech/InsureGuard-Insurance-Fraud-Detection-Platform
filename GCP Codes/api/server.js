const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { query } = require("./db");
const { createUploadUrl } = require("./storage");
const { PubSub } = require("@google-cloud/pubsub");
const { createClient } = require("redis");
const { BigQuery } = require("@google-cloud/bigquery");

const app = express();
const PORT = Number(process.env.PORT || 8080);

const pubsub = new PubSub();
const CLAIM_EVENTS_TOPIC = process.env.CLAIM_EVENTS_TOPIC || "insureguard-claim-events";

const bigquery = new BigQuery({ projectId: "jeevesh-510707" });

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

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(",").map(v => v.trim())
    : true,
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const customerId = req => req.header("x-customer-id") || req.query.customer_id || null;

async function customer(id) {
  const r = await query(
    `SELECT customer_id, customer_number, first_name, last_name, email, phone,
            date_of_birth, address_line1, city, state, postal_code, country
       FROM insureguard.customers WHERE customer_id=$1`, [id]);
  return r.rows[0] || null;
}

async function policyForCustomer(id) {
  const r = await query(
    `SELECT p.* FROM insureguard.policies p
      WHERE p.customer_id=$1 ORDER BY p.created_at DESC LIMIT 1`, [id]);
  return r.rows[0] || null;
}

app.get("/api/health", asyncRoute(async (_req,res) => {
  let database = "unavailable";
  let redisStatus = "unavailable";

  try {
    await query("SELECT 1");
    database = "ok";
  } catch (_) {}

  try {
    await redisReady;
    redisStatus = redis.isReady ? "ok" : "not_ready";
  } catch (_) {}

  res.json({
    status: "ok",
    service: "insureguard-api",
    timestamp: new Date().toISOString(),
    database,
    redis: redisStatus
  });
}));

app.post("/api/auth/login", asyncRoute(async (req,res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({error:"email is required"});
  const r = await query(
    `SELECT customer_id, customer_number, first_name, last_name, email, phone
       FROM insureguard.customers WHERE LOWER(email)=$1`, [email]);
  if (!r.rows[0]) return res.status(401).json({error:"Invalid credentials"});
  res.json({token:`demo-${uuidv4()}`, customer:r.rows[0]});
}));

app.get("/api/customer", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const c=await customer(id); if(!c) return res.status(404).json({error:"Customer not found"});
  res.json(c);
}));

app.get("/api/policy", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const p=await policyForCustomer(id); if(!p) return res.status(404).json({error:"Policy not found"});
  const v=await query(
    `SELECT v.* FROM insureguard.vehicles v WHERE v.policy_id=$1
     ORDER BY v.created_at DESC LIMIT 1`, [p.policy_id]);
  res.json({...p, vehicle:v.rows[0] || null});
}));

app.get("/api/claims", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const r=await query(
    `SELECT c.claim_id,c.claim_number,c.claim_type,c.status,c.incident_date,
            c.reported_date,c.claim_amount,c.approved_amount,c.description,
            c.damage_type,c.fraud_score,c.fraud_status,c.submitted_at,c.updated_at
       FROM insureguard.claims c JOIN insureguard.policies p ON p.policy_id=c.policy_id
      WHERE p.customer_id=$1 ORDER BY c.submitted_at DESC`, [id]);
  res.json(r.rows);
}));

app.post("/api/claims", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const {claim_type="AUTO",incident_date,claim_amount,description=null,damage_type=null,vehicle_id=null}=req.body||{};
  if(!incident_date || claim_amount===undefined)
    return res.status(400).json({error:"incident_date and claim_amount are required"});
  const p=await policyForCustomer(id); if(!p) return res.status(404).json({error:"Active policy not found"});
  let vid=vehicle_id;
  if(!vid) {
    const v=await query(
      `SELECT vehicle_id FROM insureguard.vehicles WHERE policy_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [p.policy_id]);
    vid=v.rows[0]?.vehicle_id;
  }
  if(!vid) return res.status(400).json({error:"Vehicle not found for policy"});
  const number=`CLM-${new Date().getFullYear()}-${uuidv4().slice(0,8).toUpperCase()}`;
  const r=await query(
    `INSERT INTO insureguard.claims
      (policy_id,vehicle_id,claim_number,claim_type,status,incident_date,claim_amount,
       description,damage_type,fraud_status)
     VALUES($1,$2,$3,$4,'SUBMITTED',$5,$6,$7,$8,'PENDING') RETURNING *`,
    [p.policy_id,vid,number,claim_type,incident_date,Number(claim_amount),description,damage_type]);
  const claim=r.rows[0];
  await query(
    `INSERT INTO insureguard.claim_events
      (claim_id,event_type,status,title,description,source)
     VALUES($1,'CLAIM_SUBMITTED','SUBMITTED','Claim submitted',
            'Your claim was received successfully.','API')`, [claim.claim_id]);

  await pubsub
    .topic(CLAIM_EVENTS_TOPIC)
    .publishMessage({
      json: {
        claim_id: claim.claim_id,
        event: "CLAIM_SUBMITTED"
      }
    });

  res.status(201).json(claim);
}));

app.get("/api/claims/:id", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const r=await query(
    `SELECT c.* FROM insureguard.claims c JOIN insureguard.policies p ON p.policy_id=c.policy_id
      WHERE c.claim_id=$1 AND p.customer_id=$2`, [req.params.id,id]);
  if(!r.rows[0]) return res.status(404).json({error:"Claim not found"});
  const [events,docs,assessment]=await Promise.all([
    query(`SELECT event_id,event_type,status,title,description,source,metadata,created_at
             FROM insureguard.claim_events WHERE claim_id=$1 ORDER BY created_at ASC`,[req.params.id]),
    query(`SELECT document_id,document_type,file_name,content_type,file_size_bytes,
                   processing_status,document_ai_status,uploaded_at,processed_at
             FROM insureguard.claim_documents WHERE claim_id=$1 ORDER BY uploaded_at ASC`,[req.params.id]),
    query(`SELECT assessment_id,rule_score,ml_score,final_score,risk_level,decision,
                   rules_triggered,feature_snapshot,model_name,model_version,assessed_at
             FROM insureguard.fraud_assessments WHERE claim_id=$1
             ORDER BY assessed_at DESC LIMIT 1`,[req.params.id])
  ]);
  res.json({...r.rows[0],events:events.rows,documents:docs.rows,
            fraud_assessment:assessment.rows[0]||null});
}));

app.get("/api/claims/:id/status", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const r=await query(
    `SELECT c.claim_id,c.claim_number,c.status,c.fraud_status,c.fraud_score,c.updated_at
       FROM insureguard.claims c JOIN insureguard.policies p ON p.policy_id=c.policy_id
      WHERE c.claim_id=$1 AND p.customer_id=$2`, [req.params.id,id]);
  if(!r.rows[0]) return res.status(404).json({error:"Claim not found"});
  const events=await query(
    `SELECT event_type,status,title,description,source,metadata,created_at
       FROM insureguard.claim_events WHERE claim_id=$1 ORDER BY created_at ASC`,[req.params.id]);
  res.json({...r.rows[0],events:events.rows});
}));

app.post("/api/claims/:id/upload-url", asyncRoute(async (req,res) => {
  const id=customerId(req); if(!id) return res.status(400).json({error:"customer_id is required"});
  const {file_name,content_type,document_type="CLAIM_DOCUMENT",file_size_bytes=null}=req.body||{};
  if(!file_name||!content_type)
    return res.status(400).json({error:"file_name and content_type are required"});
  const ownership=await query(
    `SELECT c.claim_id FROM insureguard.claims c JOIN insureguard.policies p ON p.policy_id=c.policy_id
      WHERE c.claim_id=$1 AND p.customer_id=$2`,[req.params.id,id]);
  if(!ownership.rows[0]) return res.status(404).json({error:"Claim not found"});
  const upload=await createUploadUrl({claimId:req.params.id,fileName:file_name,contentType:content_type});
  const d=await query(
    `INSERT INTO insureguard.claim_documents
      (claim_id,document_type,file_name,content_type,storage_bucket,storage_object,
       file_size_bytes,processing_status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING')
     RETURNING document_id,claim_id,document_type,file_name,content_type,
               storage_bucket,storage_object,file_size_bytes,processing_status,uploaded_at`,
    [req.params.id,document_type,file_name,content_type,upload.bucket,upload.object,file_size_bytes]);
  res.json({upload_url:upload.url,expires_in_seconds:upload.expiresInSeconds,document:d.rows[0]});
}));

app.get("/api/analytics/summary", asyncRoute(async (_req, res) => {
  const [claims, statuses, fraudStatuses, assessments, riskSummary, overallRisk] = await Promise.all([
    query(`
      SELECT COUNT(*)::int AS total_claims,
             COALESCE(SUM(claim_amount), 0)::numeric AS total_claimed_amount,
             COALESCE(ROUND(AVG(claim_amount), 2), 0)::numeric AS average_claim_amount
      FROM insureguard.claims
    `),
    query(`
      SELECT status, COUNT(*)::int AS claim_count
      FROM insureguard.claims
      GROUP BY status
      ORDER BY claim_count DESC
    `),
    query(`
      SELECT fraud_status, COUNT(*)::int AS claim_count
      FROM insureguard.claims
      GROUP BY fraud_status
      ORDER BY claim_count DESC
    `),
    query(`
      SELECT COUNT(*)::int AS assessed_claims,
             COUNT(*) FILTER (WHERE risk_level ILIKE 'HIGH%')::int AS high_risk_claims,
             COUNT(*) FILTER (WHERE decision ILIKE '%REVIEW%')::int AS review_decisions,
             COALESCE(ROUND(AVG(final_score), 2), 0)::numeric AS average_fraud_score
      FROM insureguard.fraud_assessments
    `),
    bigquery.query({
      query: `SELECT risk_level, assessment_count, avg_final_score, avg_ml_score
              FROM \`jeevesh-510707.insureguard_analytics.dataflow_risk_summary\`
              ORDER BY assessment_count DESC`,
      location: "us-west1"
    }),
    bigquery.query({
      query: `SELECT total_assessments, weighted_avg_final_score
              FROM \`jeevesh-510707.insureguard_analytics.dataproc_risk_summary\`
              LIMIT 1`,
      location: "us-west1"
    })
  ]);

  res.json({
    claims: claims.rows[0],
    claims_by_status: statuses.rows,
    claims_by_fraud_status: fraudStatuses.rows,
    fraud_assessments: assessments.rows[0],
    risk_by_level: riskSummary[0],
    overall_risk: overallRisk[0][0] || null
  });
}));

app.use((err,_req,res,_next)=>{
  console.error(err);
  res.status(500).json({error:"Internal server error"});
});

app.listen(PORT,"0.0.0.0",()=>console.log(`InsureGuard API listening on port ${PORT}`));