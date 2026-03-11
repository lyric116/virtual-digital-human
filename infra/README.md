# Infra

Deployment and runtime infrastructure assets live here.

- `docker`
- `docker`
  - PostgreSQL init scripts and future service Dockerfiles
- `compose`
  - foundation stack, core stack, and verification instructions
  - current core stack runs Python services from `python:3.11-slim` with local repo and `.venv` bind mounts
- `nginx`
