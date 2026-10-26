from pyspark.sql import SparkSession
from pyspark.sql.functions import col, sum as spark_sum, round as spark_round

PROJECT = "jeevesh-510707"
DATASET = "insureguard_analytics"
INPUT_TABLE = f"{PROJECT}.{DATASET}.dataflow_risk_summary"
OUTPUT_TABLE = f"{PROJECT}:{DATASET}.dataproc_risk_summary"

spark = SparkSession.builder \
    .appName("InsureGuardRiskSummary") \
    .getOrCreate()

df = spark.read.format("bigquery") \
    .option("table", INPUT_TABLE) \
    .load()

summary = df.agg(
    spark_sum("assessment_count").alias("total_assessments"),
    spark_round(
        spark_sum(col("avg_final_score") * col("assessment_count"))
        / spark_sum("assessment_count"), 2
    ).alias("weighted_avg_final_score")
)

summary.show(truncate=False)

summary.write.format("bigquery") \
    .option("table", OUTPUT_TABLE) \
    .option("writeMethod", "direct") \
    .mode("overwrite") \
    .save()

spark.stop()
