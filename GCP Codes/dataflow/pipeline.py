import apache_beam as beam
from apache_beam.options.pipeline_options import PipelineOptions

PROJECT = "jeevesh-510707"
QUERY = """
SELECT risk_level, COUNT(*) AS assessment_count,
       AVG(final_score) AS avg_final_score,
       AVG(ml_score) AS avg_ml_score
FROM `jeevesh-510707.insureguard_analytics.fraud_assessments`
GROUP BY risk_level
"""

def main():
    options = PipelineOptions(
        runner="DataflowRunner",
        project=PROJECT,
        region="us-central1",
        temp_location="gs://insureguard-claims-jeevesh/dataflow-temp",
        staging_location="gs://insureguard-claims-jeevesh/dataflow-staging",
        save_main_session=True
    )

    with beam.Pipeline(options=options) as p:
        (
            p
            | "Read BigQuery" >> beam.io.ReadFromBigQuery(
                query=QUERY, use_standard_sql=True
            )
            | "Write summary" >> beam.io.WriteToBigQuery(
                "jeevesh-510707:insureguard_analytics.dataflow_risk_summary",
                schema=(
                    "risk_level:STRING,"
                    "assessment_count:INTEGER,"
                    "avg_final_score:FLOAT,"
                    "avg_ml_score:FLOAT"
                ),
                write_disposition=beam.io.BigQueryDisposition.WRITE_TRUNCATE,
                create_disposition=beam.io.BigQueryDisposition.CREATE_IF_NEEDED
            )
        )

if __name__ == "__main__":
    main()
