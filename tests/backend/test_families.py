from __future__ import annotations

from pathlib import Path

import yaml
from django.test.utils import override_settings
from rest_framework.test import APIClient


def test_list_families_empty(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().get("/api/families/")
    assert response.status_code == 200
    assert response.json() == []


def test_create_column_family(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().post("/api/families/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["kind"] == "column"
    assert data["name"] == "Contact"
    assert data["columns"] == ["email", "phone"]


def test_create_value_family(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "value",
        "name": "ActiveStates",
        "owner": {"kind": "column", "name": "status"},
        "values": ["active", "enabled"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().post("/api/families/", payload, format="json")
    assert response.status_code == 201
    data = response.json()
    assert data["kind"] == "value"
    assert data["values"] == ["active", "enabled"]


def test_create_duplicate_family_rejected(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response1 = APIClient().post("/api/families/", payload, format="json")
        assert response1.status_code == 201
        response2 = APIClient().post("/api/families/", payload, format="json")
    assert response2.status_code == 400


def test_create_family_invalid_name(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "123invalid",
        "columns": ["email"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().post("/api/families/", payload, format="json")
    assert response.status_code == 400


def test_get_family(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        APIClient().post("/api/families/", payload, format="json")
        response = APIClient().get("/api/families/Contact/")
    assert response.status_code == 200
    assert response.json()["name"] == "Contact"


def test_get_family_not_found(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().get("/api/families/NonExistent/")
    assert response.status_code == 404


def test_update_family(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        create_resp = APIClient().post("/api/families/", payload, format="json")
        assert create_resp.status_code == 201
        update_payload = {
            "kind": "column",
            "name": "Contact",
            "columns": ["email", "phone", "sms"],
            "version": 1,
        }
        response = APIClient().put(
            "/api/families/Contact/", update_payload, format="json"
        )
    assert response.status_code == 200
    assert response.json()["columns"] == ["email", "phone", "sms"]


def test_update_family_version_conflict(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        APIClient().post("/api/families/", payload, format="json")
        update_payload = {
            "kind": "column",
            "name": "Contact",
            "columns": ["email"],
            "version": 99,
        }
        response = APIClient().put(
            "/api/families/Contact/", update_payload, format="json"
        )
    assert response.status_code == 409


def test_delete_family(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    payload = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email", "phone"],
    }
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        APIClient().post("/api/families/", payload, format="json")
        response = APIClient().delete("/api/families/Contact/")
    assert response.status_code == 204


def test_delete_family_not_found(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().delete("/api/families/NonExistent/")
    assert response.status_code == 404


def test_list_families_skips_invalid_yaml(tmp_path: Path) -> None:
    families_dir = tmp_path / "families"
    families_dir.mkdir(parents=True)
    (families_dir / "bad.yaml").write_text("not: valid: family: structure")
    valid = {
        "kind": "column",
        "name": "Contact",
        "columns": ["email"],
    }
    (families_dir / "Contact.yaml").write_text(
        yaml.safe_dump(valid)
    )
    with override_settings(FAMILY_CONFIG_DIR=families_dir):
        response = APIClient().get("/api/families/")
    assert response.status_code == 200
    names = [f["name"] for f in response.json()]
    assert "bad" not in names
    assert "Contact" in names
