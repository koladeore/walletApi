# Local Kubernetes development

These manifests target a local development cluster such as kind or minikube. They use locally loaded images, a development hostname, a single PostgreSQL replica, and a single Redis replica. The demo ingress does not configure TLS. Use a dedicated local context and synthetic wallet data.

1. Verify your current context with `kubectl config current-context`. Set up a default StorageClass, an ingress controller for the `nginx` class if using ingress, and Metrics Server if testing the HPA.
2. From the repository root, build the two images below and load them into your local cluster using its image-loading command. Both image tags must be present on the nodes where the workloads can run.

   ```bash
   docker build --target production -t wallet-api:local .
   docker build --target build -t wallet-migrate:local .
   ```

   For Minikube, load each image into the same profile used by kubectl. Replace `wallet-local` with your profile name.

   ```bash
   minikube -p wallet-local image load wallet-api:local
   minikube -p wallet-local image load wallet-migrate:local
   ```

3. Create `k8s/secrets/postgres.env` with local `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` values. Create `k8s/secrets/wallet.env` with a matching `DATABASE_URL` using the `postgres` service hostname, and distinct random values for `JWT_SECRET`, `REFRESH_SECRET`, and `AUTH_SECURITY_SECRET`. Use at least 32 characters for each secret. Both files are ignored by Git.

   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl -n wallet create secret generic postgres-secret --from-env-file=k8s/secrets/postgres.env
   kubectl -n wallet create secret generic wallet-secret --from-env-file=k8s/secrets/wallet.env
   kubectl apply -f k8s/configmap.yaml -f k8s/postgres-pvc.yaml -f k8s/postgres.yaml -f k8s/redis.yaml
   kubectl -n wallet rollout status statefulset/postgres
   kubectl -n wallet rollout status deployment/redis
   kubectl apply -f k8s/migration-job.yaml
   kubectl -n wallet wait --for=condition=complete job/wallet-migrate --timeout=300s
   kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/worker.yaml -f k8s/hpa.yaml
   kubectl -n wallet rollout status deployment/wallet-api
   kubectl -n wallet rollout status deployment/wallet-worker
   kubectl -n wallet port-forward service/wallet-api-service 3000:3000
   ```

4. Check `http://localhost:3000/api/v1` or visit `http://localhost:3000/api/docs`. With Metrics Server enabled, run `kubectl -n wallet get hpa` and allow time for the first CPU samples.

To use the optional ingress, apply `k8s/ingress.yaml` and resolve `wallet.test` to the local ingress address. With the Minikube ingress addon, you can also verify routing without editing your hosts file. Run the port-forward in one terminal and curl in another.

```bash
kubectl -n ingress-nginx port-forward service/ingress-nginx-controller 8080:80
curl --fail -H 'Host: wallet.test' http://127.0.0.1:8080/api/v1
```

Before adapting the manifests to a shared cluster, add HTTPS, network policies, Redis authentication, scoped service and database credentials, immutable registry images, dependency-aware readiness checks, and persistent volume backup and restore procedures. The checked-in probes verify that the HTTP process responds.
