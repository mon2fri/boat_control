from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from apps.configs.services import (
    ConfigConflictError,
    ConfigNameError,
    ConfigNotFoundError,
    create_config,
    delete_config,
    get_config,
    list_configs,
    update_config,
    validate_config_name,
)


@pytest.fixture
def config_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


class TestValidateConfigName:
    def test_valid_names(self) -> None:
        assert validate_config_name("my-config") == "my-config"
        assert validate_config_name("My Config 123") == "My Config 123"
        assert validate_config_name("  trimmed  ") == "trimmed"
        assert validate_config_name("a" * 120) == "a" * 120

    def test_empty_name(self) -> None:
        with pytest.raises(ConfigNameError, match="must not be empty"):
            validate_config_name("")
        with pytest.raises(ConfigNameError, match="must not be empty"):
            validate_config_name("   ")

    def test_too_long(self) -> None:
        with pytest.raises(ConfigNameError, match="at most 120"):
            validate_config_name("a" * 121)

    def test_path_separators(self) -> None:
        with pytest.raises(ConfigNameError, match="path separators"):
            validate_config_name("foo/bar")
        with pytest.raises(ConfigNameError, match="path separators"):
            validate_config_name("foo\\bar")

    def test_dot_segments(self) -> None:
        with pytest.raises(ConfigNameError, match="must not be"):
            validate_config_name(".")
        with pytest.raises(ConfigNameError, match="must not be"):
            validate_config_name("..")

    def test_control_characters(self) -> None:
        with pytest.raises(ConfigNameError, match="control"):
            validate_config_name("foo\nbar")
        with pytest.raises(ConfigNameError, match="control"):
            validate_config_name("foo\tbar")

    def test_reserved_characters(self) -> None:
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name("foo<bar")
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name("foo>bar")
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name('foo"bar')
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name("foo|bar")
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name("foo?bar")
        with pytest.raises(ConfigNameError, match="reserved"):
            validate_config_name("foo*bar")


class TestConfigCrud:
    def test_list_empty(self, config_dir: Path) -> None:
        configs = list_configs(config_dir)
        assert configs == []

    def test_create_and_list(self, config_dir: Path) -> None:
        cfg = create_config(config_dir, "test-config", {"foo": "bar"})
        assert cfg.name == "test-config"
        assert cfg.version == 1
        assert cfg.content["foo"] == "bar"

        configs = list_configs(config_dir)
        assert len(configs) == 1
        assert configs[0].name == "test-config"
        assert configs[0].version == 1

    def test_get(self, config_dir: Path) -> None:
        create_config(config_dir, "my-config", {"key": "value"})
        cfg = get_config(config_dir, "my-config")
        assert cfg is not None
        assert cfg.name == "my-config"
        assert cfg.content["key"] == "value"

    def test_get_not_found(self, config_dir: Path) -> None:
        cfg = get_config(config_dir, "nonexistent")
        assert cfg is None

    def test_create_duplicate_name(self, config_dir: Path) -> None:
        create_config(config_dir, "dup", {"a": 1})
        with pytest.raises(ConfigNameError, match="already exists"):
            create_config(config_dir, "dup", {"b": 2})

    def test_update(self, config_dir: Path) -> None:
        create_config(config_dir, "upd", {"v": 1})
        updated = update_config(config_dir, "upd", {"v": 2}, expected_version=1)
        assert updated.version == 2
        assert updated.content["v"] == 2

    def test_update_not_found(self, config_dir: Path) -> None:
        with pytest.raises(ConfigNotFoundError, match="not found"):
            update_config(config_dir, "missing", {}, expected_version=1)

    def test_update_conflict(self, config_dir: Path) -> None:
        create_config(config_dir, "conf", {"x": 1})
        with pytest.raises(ConfigConflictError, match="modified"):
            update_config(config_dir, "conf", {"x": 3}, expected_version=99)

    def test_delete(self, config_dir: Path) -> None:
        create_config(config_dir, "del", {"d": 1})
        delete_config(config_dir, "del")
        assert get_config(config_dir, "del") is None

    def test_delete_not_found(self, config_dir: Path) -> None:
        with pytest.raises(ConfigNotFoundError, match="not found"):
            delete_config(config_dir, "nope")

    def test_injection_names(self, config_dir: Path) -> None:
        """Injection-shaped names must be rejected, not executed."""
        injections = [
            "foo; rm -rf /",
            "foo' OR '1'='1",
            "${malicious}",
            "<script>alert(1)</script>",
            "__import__('os').system('ls')",
        ]
        for name in injections:
            with pytest.raises(ConfigNameError):
                create_config(config_dir, name, {"p": 1})

    def test_injection_content_values(self, config_dir: Path) -> None:
        """Injection-shaped content values must be stored as data, not executed."""
        injections = [
            "'; DROP TABLE rules; --",
            "$(cat /etc/passwd)",
            "{{ 7 * 7 }}",
        ]
        for val in injections:
            cfg = create_config(config_dir, f"safe-{hash(val)}", {"payload": val})
            assert cfg.content["payload"] == val

    def test_multiple_configs(self, config_dir: Path) -> None:
        create_config(config_dir, "alpha", {"order": 1})
        create_config(config_dir, "beta", {"order": 2})
        create_config(config_dir, "gamma", {"order": 3})
        configs = list_configs(config_dir)
        names = [c.name for c in configs]
        assert names == ["alpha", "beta", "gamma"]

    def test_create_with_list_content(self, config_dir: Path) -> None:
        """Rules configs save an array as content; the service must accept
        a list and round-trip it back to the caller unchanged."""
        rules = [
            {"rule_id": "R001", "name": "First", "logic": {}},
            {"rule_id": "R002", "name": "Second", "logic": {}},
        ]
        cfg = create_config(config_dir, "rules-snapshot", rules)
        assert cfg.version == 1
        assert cfg.content == rules

        loaded = get_config(config_dir, "rules-snapshot")
        assert loaded is not None
        assert loaded.version == 1
        assert loaded.content == rules

        listed = list_configs(config_dir)
        assert [c.name for c in listed] == ["rules-snapshot"]
        assert listed[0].content == rules

    def test_update_with_list_content(self, config_dir: Path) -> None:
        rules_v1 = [{"rule_id": "R001", "name": "First", "logic": {}}]
        rules_v2 = [
            {"rule_id": "R001", "name": "First", "logic": {}},
            {"rule_id": "R002", "name": "Added", "logic": {}},
        ]
        create_config(config_dir, "rules-snapshot", rules_v1)
        updated = update_config(
            config_dir, "rules-snapshot", rules_v2, expected_version=1
        )
        assert updated.version == 2
        assert updated.content == rules_v2

        loaded = get_config(config_dir, "rules-snapshot")
        assert loaded is not None
        assert loaded.version == 2
        assert loaded.content == rules_v2

    def test_rejects_non_dict_non_list_content(self, config_dir: Path) -> None:
        """Scalar content is not a valid config payload."""
        with pytest.raises(ConfigNameError, match="object or array"):
            create_config(config_dir, "scalar", "just a string")


class TestPresetSourceOpaqueIds:
    def test_opaque_id_is_consistent(self) -> None:
        from apps.files.preset_services import _opaque_file_id

        root = Path("/data/presets")
        rel = Path("baseline.csv")
        id1 = _opaque_file_id(root, rel)
        id2 = _opaque_file_id(root, rel)
        assert id1 == id2
        assert len(id1) == 16

    def test_opaque_id_differs_for_different_paths(self) -> None:
        from apps.files.preset_services import _opaque_file_id

        root = Path("/data/presets")
        id_a = _opaque_file_id(root, Path("a.csv"))
        id_b = _opaque_file_id(root, Path("b.csv"))
        assert id_a != id_b

    def test_opaque_id_differs_for_different_roots(self) -> None:
        from apps.files.preset_services import _opaque_file_id

        id1 = _opaque_file_id(Path("/root1"), Path("f.csv"))
        id2 = _opaque_file_id(Path("/root2"), Path("f.csv"))
        assert id1 != id2
