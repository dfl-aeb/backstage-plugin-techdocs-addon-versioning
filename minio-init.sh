#!/bin/sh

# Path to the flag file
FLAG_FILE="/data/.minio_initialized"

# Check if initialization has already been done
if [ -f "$FLAG_FILE" ]; then
    echo "MinIO already initialized."
    exit 0
fi

# Wait until MinIO is fully started
sleep 5

# Configure the mc alias
mc alias set myminio http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Create a new bucket if it does not exist
mc mb myminio/$TECHDOCS_S3_BUCKET_NAME 2>/dev/null || echo "Bucket $TECHDOCS_S3_BUCKET_NAME exists"

# Create a new user and generate an API key if the user does not exist
mc admin user add myminio $TECHDOCS_S3_ACCESS_KEY_ID $TECHDOCS_S3_SECRET_ACCESS_KEY 2>/dev/null || echo "User $TECHDOCS_S3_ACCESS_KEY_ID exists"

# Attach the readwrite policy to the new user if it is not already set
mc admin policy attach myminio readwrite --user $TECHDOCS_S3_ACCESS_KEY_ID 2>/dev/null || echo "Policy readwrite already attached to user $TECHDOCS_S3_ACCESS_KEY_ID"

# Create the flag file to indicate that initialization is complete
touch "$FLAG_FILE"
