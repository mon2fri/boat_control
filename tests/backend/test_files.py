from pathlib import Path

import pytest
from apps.files.services import (
    HeaderInspectionResult,
    inspect_headers,
    read_csv_headers,
    safe_upload_path,
)
from django.test import TestCase
from rest_framework.test import APIClient  # type: ignore[import-untyped]


@pytest.fixture
def sample_csv_a(tmp_path: Path) -> Path:
    path = tmp_path / "data_a.csv"
    path.write_text("id,name,value\n1,alpha,10\n2,beta,20\n")
    return path


@pytest.fixture
def sample_csv_b(tmp_path: Path) -> Path:
    path = tmp_path / "data_b.csv"
    path.write_text("id,name,score\n1,alpha,100\n3,gamma,300\n")
    return path


class TestSafeUploadPath:
    def test_returns_path_in_uploads_dir(self) -> None:
        result = safe_upload_path("test.csv")
        assert result.parent.name == "uploads"

    def test_sanitizes_dangerous_names(self) -> None:
        result = safe_upload_path("../../../etc/passwd")
        assert ".." not in result.name
        assert "/" not in result.name

    def test_handles_hidden_files(self) -> None:
        result = safe_upload_path(".hidden")
        assert not result.name.startswith(".")


class TestReadCsvHeaders:
    def test_reads_headers_correctly(self, sample_csv_a: Path) -> None:
        headers = read_csv_headers(sample_csv_a)
        assert headers == ["id", "name", "value"]

    def test_reads_single_column_csv(self, tmp_path: Path) -> None:
        path = tmp_path / "single.csv"
        path.write_text("col1\n1\n2\n")
        headers = read_csv_headers(path)
        assert headers == ["col1"]


class TestInspectHeaders:
    def test_finds_common_and_unique_columns(self, sample_csv_a: Path, sample_csv_b: Path) -> None:
        result = inspect_headers(sample_csv_a, "a.csv", sample_csv_b, "b.csv")
        assert isinstance(result, HeaderInspectionResult)
        assert set(result.common_columns) == {"id", "name"}
        assert result.only_in_a == ["value"]
        assert result.only_in_b == ["score"]

    def test_identical_headers(self, sample_csv_a: Path) -> None:
        result = inspect_headers(sample_csv_a, "a.csv", sample_csv_a, "a2.csv")
        assert result.common_columns == ["id", "name", "value"]
        assert result.only_in_a == []
        assert result.only_in_b == []


class TestFileUploadEndpoint(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_upload_requires_post(self) -> None:
        response = self.client.get("/api/files/upload/")
        self.assertEqual(response.status_code, 405)

    def test_upload_rejects_non_csv(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        txt = SimpleUploadedFile("test.txt", b"not a csv", content_type="text/plain")
        response = self.client.post("/api/files/upload/", {"file_a": txt, "file_b": txt})
        self.assertIn(response.status_code, [400, 415])

    def test_upload_returns_session_id(self) -> None:
        from django.core.files.uploadedfile import SimpleUploadedFile

        csv_a = SimpleUploadedFile("test_a.csv", b"id,name\n1,alpha\n", content_type="text/csv")
        csv_b = SimpleUploadedFile("test_b.csv", b"id,name\n1,alpha\n", content_type="text/csv")
        response = self.client.post("/api/files/upload/", {"file_a": csv_a, "file_b": csv_b})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("session_id", data)
        self.assertIn("inspection", data)
        self.assertIn("columns_a", data["inspection"])
        self.assertIn("common_columns", data["inspection"])
