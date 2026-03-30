pipeline {
    agent any

    environment {
        REGISTRY = "registry.myapp.com"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Preflight Registry Check') {
            steps {
                echo 'Validating registry DNS and /v2/ reachability...'
                sh '''
                    set -eu
                    if ! command -v getent >/dev/null 2>&1; then
                      echo "ERROR: getent is required for DNS checks"
                      exit 1
                    fi
                    resolved_ip="$(getent hosts "${REGISTRY}" | awk 'NR==1{print $1}')"
                    if [ -z "${resolved_ip}" ]; then
                      echo "ERROR: ${REGISTRY} does not resolve from Jenkins agent."
                      exit 1
                    fi
                    echo "INFO: ${REGISTRY} resolves to ${resolved_ip}"

                    status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "http://${REGISTRY}/v2/" || true)"
                    if [ "${status}" != "200" ]; then
                      echo "ERROR: Registry health check failed: http://${REGISTRY}/v2/ returned status '${status}'."
                      echo "HINT: This is commonly caused by stale /etc/hosts mapping after VM IP changes."
                      echo "HINT: Ensure registry.myapp.com points to the current manager IP and Traefik/registry services are up."
                      exit 1
                    fi
                    echo "INFO: Registry is reachable."
                '''
            }
        }

        stage('Build Images') {
            steps {
                echo 'Building Backend and Frontend Docker Images...'
                sh "docker build -t ${REGISTRY}/dockerdemo ./backend"
                sh "docker build -t ${REGISTRY}/dockerdemoweb ./frontend"
            }
        }

        stage('Push to Registry') {
            steps {
                echo 'Pushing images to local registry...'
                sh "docker push ${REGISTRY}/dockerdemo"
                sh "docker push ${REGISTRY}/dockerdemoweb"
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying to Swarm...'
                sh "docker stack deploy -c docker/docker-compose-app.yml myapp --with-registry-auth"
            }
        }
    }
}
