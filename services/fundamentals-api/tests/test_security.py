import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import security
from app.main import app
from app.rate_limit import client_ip


class TestRequireBearer:
    def test_accepts_exact_bearer(self):
        security.require_bearer("Bearer s3cret", "s3cret", name="x")  # no raise

    @pytest.mark.parametrize(
        "header", [None, "", "s3cret", "bearer s3cret", "Bearer wrong", "Bearer s3cret ", "Bearer "]
    )
    def test_rejects_bad_headers_with_401(self, header):
        with pytest.raises(HTTPException) as exc:
            security.require_bearer(header, "s3cret", name="x")
        assert exc.value.status_code == 401

    @pytest.mark.parametrize("token", [None, ""])
    def test_refuses_with_503_when_unconfigured(self, token):
        # Fail closed: an unset secret must never let a request through.
        with pytest.raises(HTTPException) as exc:
            security.require_bearer("Bearer anything", token, name="ipo_ingest_token")
        assert exc.value.status_code == 503

    def test_uses_constant_time_compare(self, monkeypatch):
        calls = []
        real = security.hmac.compare_digest
        monkeypatch.setattr(security.hmac, "compare_digest", lambda a, b: calls.append(1) or real(a, b))
        security.require_bearer("Bearer s3cret", "s3cret", name="x")
        assert calls


class TestIsPublicIp:
    @pytest.mark.parametrize(
        "ip",
        ["127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.0.1", "169.254.169.254", "100.64.0.1",
         "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "224.0.0.1"],
    )
    def test_rejects_non_public(self, ip):
        assert security.is_public_ip(ip) is False

    @pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    def test_accepts_public(self, ip):
        assert security.is_public_ip(ip) is True

    def test_garbage_is_not_public(self):
        assert security.is_public_ip("not-an-ip") is False


class TestValidatePublicUrl:
    @staticmethod
    def _resolver(mapping):
        return lambda host: mapping[host]

    def test_accepts_public_https(self):
        security.validate_public_url("https://example.com/a.pdf", resolve=self._resolver({"example.com": ["93.184.216.34"]}))

    @pytest.mark.parametrize(
        "url",
        ["ftp://example.com/x", "file:///etc/passwd", "https://user:pw@example.com/x", "https:///nohost", "javascript:1"],
    )
    def test_rejects_bad_shape(self, url):
        with pytest.raises(security.UnsafeUrlError):
            security.validate_public_url(url, resolve=self._resolver({"example.com": ["93.184.216.34"]}))

    @pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.1.1", "169.254.169.254", "::1"])
    def test_rejects_ip_literals_that_are_private(self, ip):
        host = f"[{ip}]" if ":" in ip else ip
        with pytest.raises(security.UnsafeUrlError):
            security.validate_public_url(f"http://{host}/x", resolve=lambda h: [ip])

    def test_rejects_hostname_resolving_to_private(self):
        with pytest.raises(security.UnsafeUrlError):
            security.validate_public_url("https://evil.example/x", resolve=self._resolver({"evil.example": ["10.0.0.5"]}))

    def test_rejects_if_any_resolved_address_is_private(self):
        # DNS answers with one public and one internal record.
        with pytest.raises(security.UnsafeUrlError):
            security.validate_public_url(
                "https://mixed.example/x", resolve=self._resolver({"mixed.example": ["93.184.216.34", "127.0.0.1"]})
            )

    def test_rejects_unresolvable(self):
        def boom(host):
            raise OSError("nxdomain")

        with pytest.raises(security.UnsafeUrlError):
            security.validate_public_url("https://nope.example/x", resolve=boom)


class TestClientIp:
    def test_prefers_platform_set_headers_over_spoofable_xff(self):
        headers = {"x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 5.6.7.8"}
        assert client_ip(headers, "10.0.0.1") == "203.0.113.9"
        assert client_ip({"x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4"}, None) == "198.51.100.7"

    def test_falls_back_to_xff_then_socket(self):
        assert client_ip({"x-forwarded-for": "1.2.3.4, 5.6.7.8"}, "10.0.0.1") == "1.2.3.4"
        assert client_ip({}, "10.0.0.1") == "10.0.0.1"
        assert client_ip({}, None) == "unknown-ip"


def test_responses_carry_security_headers():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "max-age" in response.headers["strict-transport-security"]
