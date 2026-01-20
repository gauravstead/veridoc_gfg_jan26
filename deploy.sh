#!/bin/bash

# Deploy Backend and Frontend to GCP Cloud Run in parallel

echo "Starting parallel deployment to asia-south1..."

# Deploy Backend
gcloud run deploy veridoc-backend \
  --source ./backend \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --env-vars-file ./backend/.env &

# Deploy Frontend
gcloud run deploy veridoc-frontend \
  --source ./frontend \
  --region asia-south1 \
  --allow-unauthenticated &

# Wait for both background processes to complete
wait

echo "Deployment complete!"
