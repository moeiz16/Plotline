from fastapi.testclient import TestClient

from app.main import create_app


def test_health_and_metrics() -> None:
    client = TestClient(create_app())
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/api/v1/health/ready").json()["eoSource"] == "bundled"
    assert client.get("/metrics").status_code == 200
