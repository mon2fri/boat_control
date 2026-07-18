from django.test import TestCase
from rest_framework.test import APIClient  # type: ignore[import-untyped]


class HealthEndpointTest(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_health_returns_ok(self) -> None:
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_only_allows_get(self) -> None:
        response = self.client.post("/api/health/")
        self.assertIn(response.status_code, [405])
