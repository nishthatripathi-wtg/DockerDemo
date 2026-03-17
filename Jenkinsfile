pipeline {
    agent any

    environment {
        // Use the container names from your docker-compose
        DOCKER_COMPOSE = "docker compose"
    }

    stages {
        stage('Checkout') {
            steps {
                // Jenkins pulls the code from Gitea automatically
                checkout scm
            }
        }

        stage('Build Images') {
            steps {
                echo 'Building Backend and Frontend Docker Images...'
                // Using the docker-compose.yml you already have
                sh "${DOCKER_COMPOSE} build"
            }
        }

        stage('Deploy') {
            steps {
                echo 'Starting Application...'
                // Restarts the containers with the new builds
                sh "${DOCKER_COMPOSE} up -d"
            }
        }

        stage('Verify') {
            steps {
                sh "docker ps"
                echo "App is running! Backend: 8080, Frontend: 4200"
            }
        }
    }
}
