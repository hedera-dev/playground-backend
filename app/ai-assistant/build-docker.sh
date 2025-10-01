docker build --platform linux/amd64 -t ai . 
docker tag ai us-central1-docker.pkg.dev/playground-develop-441415/playground/ai-assistant:1.0.0-beta.3
docker push us-central1-docker.pkg.dev/playground-develop-441415/playground/ai-assistant:1.0.0-beta.3