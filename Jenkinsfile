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