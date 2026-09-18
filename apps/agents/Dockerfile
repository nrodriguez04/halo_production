FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY halo_agents ./halo_agents
RUN pip install --no-cache-dir .
# No provider keys in this image; it talks to the api only.
ENTRYPOINT ["python", "-m", "halo_agents.main"]
