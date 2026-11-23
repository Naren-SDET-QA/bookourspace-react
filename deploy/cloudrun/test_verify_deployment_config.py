#!/usr/bin/env python3
"""Positive and negative tests for the Cloud Run deployment audit (SEC-06).

Every negative case copies the real deployment files into a temporary root,
mutates exactly one security-relevant value, and proves that
`verify-deployment-config.py` fails with the matching check label. That is the
evidence the CI job is real: a broken configuration cannot pass it.

Run:
    python3 deploy/cloudrun/test_verify_deployment_config.py -v
"""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
VERIFIER = HERE / "verify-deployment-config.py"

SERVICE = "deploy/cloudrun/service.yaml"
DOCKER = "deploy/cloudrun/Dockerfile"
SERVER = "server.ts"


def copy_fixture(target: Path) -> None:
    """Copy only what the audit reads, so a mutation cannot touch the repository."""
    shutil.copytree(REPO_ROOT / "deploy", target / "deploy")
    (target / "src/server").mkdir(parents=True)
    shutil.copy2(REPO_ROOT / "src/server/supabaseProductionGuard.ts", target / "src/server/supabaseProductionGuard.ts")
    shutil.copy2(REPO_ROOT / SERVER, target / SERVER)


def run_audit(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(VERIFIER), "--root", str(root)],
        capture_output=True,
        text=True,
    )


class DeploymentConfigAuditTest(unittest.TestCase):
    def test_real_configuration_passes(self) -> None:
        result = run_audit(REPO_ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PASS: deployment configuration audit complete", result.stdout)

    def assert_mutation_blocks(self, relative: str, old: str, new: str, expected: str) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            copy_fixture(root)
            target = root / relative
            text = target.read_text()
            self.assertIn(old, text, f"fixture no longer contains the anchor for {expected}")
            target.write_text(text.replace(old, new, 1))
            result = run_audit(root)
            combined = result.stdout + result.stderr
            self.assertEqual(result.returncode, 1, combined)
            self.assertIn(expected, combined)
            self.assertIn("BLOCKED:", result.stderr)

    def test_demo_payment_flag_blocks(self) -> None:
        self.assert_mutation_blocks(
            SERVICE,
            '- name: BOS_PAYMENT_SANDBOX\n              value: "0"',
            '- name: BOS_PAYMENT_SANDBOX\n              value: "1"',
            "BOS_PAYMENT_SANDBOX=0",
        )

    def test_trusted_proxy_hops_block(self) -> None:
        self.assert_mutation_blocks(
            SERVICE,
            '- name: BOS_TRUST_PROXY_HOPS\n              value: "1"',
            '- name: BOS_TRUST_PROXY_HOPS\n              value: "2"',
            "trusted proxy hops pinned",
        )

    def test_startup_probe_must_use_readiness_endpoint(self) -> None:
        self.assert_mutation_blocks(
            SERVICE,
            "path: /api/health",
            "path: /api/ready",
            "startup probe uses PostgreSQL readiness",
        )

    def test_public_invoker_blocks(self) -> None:
        self.assert_mutation_blocks(
            SERVICE,
            "run.googleapis.com/ingress: all",
            'run.googleapis.com/ingress: all\n    run.googleapis.com/invoker-iam: "allUsers"',
            "does not grant public invoker",
        )

    def test_unpinned_secret_reference_blocks(self) -> None:
        self.assert_mutation_blocks(
            SERVICE,
            "name: supabase-secret-key",
            "name: supabase-anon-key",
            "supabase-secret-key via Secret Manager",
        )

    def test_hard_coded_project_host_blocks(self) -> None:
        project_ref = "a" * 20
        host = "https://" + project_ref + ".supabase.co"
        self.assert_mutation_blocks(
            SERVICE,
            '- name: BOS_TRUST_PROXY_HOPS',
            f'- name: BOS_SUPABASE_URL_LEAK\n              value: "{host}"',
            "service.yaml hard-codes no Supabase project host",
        )

    def test_non_root_container_blocks(self) -> None:
        self.assert_mutation_blocks(DOCKER, "USER nodejs", "USER root", "container runs non-root")

    def test_startup_guard_ordering_blocks(self) -> None:
        self.assert_mutation_blocks(
            SERVER,
            "assertProductionSupabaseEnvironment();",
            "",
            "production startup validates Supabase separation before listening",
        )

    def test_malformed_yaml_fails_without_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            copy_fixture(root)
            (root / SERVICE).write_text("spec: [unterminated\n")
            result = run_audit(root)
            combined = result.stdout + result.stderr
            self.assertEqual(result.returncode, 1, combined)
            self.assertIn("service.yaml parses as YAML", combined)
            self.assertNotIn("Traceback", combined)


if __name__ == "__main__":
    unittest.main(verbosity=2)
