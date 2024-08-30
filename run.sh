#!/bin/bash
# script for running backstage locally
set -e
# set environment variables
source backstage.local.env

# remove all old containers and volumes as it conflicts with the init script
# docker-compose down -v

echo "-----------------------------------------------"
echo "Starting minio container"
echo "-----------------------------------------------"
docker-compose up &

echo "-----------------------------------------------"
echo "Starting backstage"
echo "-----------------------------------------------"
yarn install && yarn dev
