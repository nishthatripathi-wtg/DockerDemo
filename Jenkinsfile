pipeline {
    agent any

    environment {
        REGISTRY = "172.27.1.79:5000"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
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
                sh "docker stack deploy -c docker-compose-swarm.yml myapp --with-registry-auth"
            }
        }
    }
}