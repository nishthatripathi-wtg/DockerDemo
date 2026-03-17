pipeline {
    agent any

    environment {
        DOCKER_COMPOSE = "docker compose"
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
                sh "${DOCKER_COMPOSE} build"
            }
        }

        stage('Deploy') {
            steps {
                echo 'Starting Application...'
                sh "${DOCKER_COMPOSE} up -d"
            }
        }
    }
}
