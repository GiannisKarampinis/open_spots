# =========================================================
# 🚀 OpenSpots Unified Test and CI Automation
# =========================================================



# Python and Node virtual environments
PYTHON = python
MANAGE = backend/manage.py
FRONTEND_DIR = frontend

# Default target
.DEFAULT_GOAL := help

# ---------------------------------------------------------
# 🧩 HELP MENU
# ---------------------------------------------------------
help:
	@echo ""
	@echo "🧰 OpenSpots Developer Commands"
	@echo "-------------------------------------------"
	@echo " make setup         → install all backend & frontend deps"
	@echo " make up            → start docker services (db, django)"
	@echo " make down          → stop docker services"
	@echo " make test          → run all tests (unit + integration + frontend)"
	@echo " make test-backend  → run Django + API tests"
	@echo " make test-frontend → run Jest tests"
	@echo " make test-e2e      → run Playwright browser tests"
	@echo " make ci            → run full CI workflow locally"
	@echo "-------------------------------------------"
	@echo ""

# ---------------------------------------------------------
# 🏗️ SETUP
# ---------------------------------------------------------
setup:
	@echo "🔧 Installing backend dependencies..."
	pip install -r requirements.txt
	@echo "📦 Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install
	@echo "✅ Setup complete."

# ---------------------------------------------------------
# 🐳 DOCKER MANAGEMENT
# ---------------------------------------------------------
up:
	@echo "🚀 Starting Docker services..."
	docker-compose up -d
	@echo "⌛ Waiting for Django to become ready..."
	sleep 10
	curl -f http://127.0.0.1:8000/venues || true

down:
	@echo "🧹 Stopping Docker services..."
	docker-compose down

# ---------------------------------------------------------
# 🧪 TESTING COMMANDS
# ---------------------------------------------------------
test-backend:
	@echo "🧠 Running Django backend tests..."
	pytest backend/ --disable-warnings -q

test-frontend:
	@echo "🎨 Running frontend Jest tests..."
	cd $(FRONTEND_DIR) && npm run test -- --ci --passWithNoTests

test-e2e:
	@echo "🌐 Running Playwright end-to-end tests..."
	cd $(FRONTEND_DIR) && npx playwright test

test:
	@echo "🧩 Running all tests (backend + frontend)..."
	make test-backend
	make test-frontend
	make test-e2e

# ---------------------------------------------------------
# 🧪 CI TESTS (simulated local)
# ---------------------------------------------------------
ci:
	@echo "🔁 Running full CI workflow (Docker + Jest + Playwright)..."
	docker-compose up -d
	@echo "⌛ Waiting for Django to be ready..."
	npx wait-on http://127.0.0.1:8000/venues
	cd $(FRONTEND_DIR) && npm run test:ci
	docker-compose down

# ---------------------------------------------------------
# 🧹 CLEANUP
# ---------------------------------------------------------
clean:
	@echo "🧽 Cleaning cache and temp files..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/test-results
	rm -rf $(FRONTEND_DIR)/playwright-report
	@echo "✅ Cleaned."

# ---------------------------------------------------------
# 🚀 DEPLOYMENT AUTOMATION
# ---------------------------------------------------------
# Customize these for your environment
SSH_USER = youruser
SSH_HOST = your.server.com
PROJECT_PATH = /srv/openspots
DOCKER_COMPOSE_FILE = docker-compose.prod.yml

# Build and push Docker image before deploy
deploy-build:
	@echo "🏗️ Building production Docker image..."
	docker build -t openspots:latest .
	docker tag openspots:latest $(SSH_USER)/openspots:latest

deploy-push:
	@echo "📤 Pushing Docker image to remote registry..."
	docker push $(SSH_USER)/openspots:latest

# Deploy to remote server via SSH
deploy:
	@echo "🚀 Deploying to production server..."
	ssh $(SSH_USER)@$(SSH_HOST) "\
		cd $(PROJECT_PATH) && \
		git pull && \
		docker-compose -f $(DOCKER_COMPOSE_FILE) pull && \
		docker-compose -f $(DOCKER_COMPOSE_FILE) up -d --build && \
		docker system prune -f \
	"
	@echo "✅ Deployment complete!"

# Combined CI + Deploy (for GitHub Actions)
ci-deploy:
	make ci
	make deploy
