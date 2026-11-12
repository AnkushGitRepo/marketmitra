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

    def test_on_cloud_run_uses_the_last_xff_hop_that_google_appended(self, monkeypatch):
        # Cloud Run sets K_SERVICE. Its front end appends the real client IP to the END of
        # X-Forwarded-For; the first hop is whatever the client sent, so it must not be trusted.
        monkeypatch.setenv("K_SERVICE", "marketmitra-fundamentals")
        assert client_ip({"x-forwarded-for": "6.6.6.6, 203.0.113.9"}, "10.0.0.1") == "203.0.113.9"
        assert client_ip({"x-forwarded-for": "203.0.113.9"}, "10.0.0.1") == "203.0.113.9"
        assert client_ip({"x-forwarded-for": " , "}, "10.0.0.1") == "10.0.0.1"
        assert client_ip({}, "10.0.0.1") == "10.0.0.1"

    def test_off_cloud_run_still_uses_the_first_hop(self, monkeypatch):
        monkeypatch.delenv("K_SERVICE", raising=False)
        assert client_ip({"x-forwarded-for": "1.2.3.4, 5.6.7.8"}, "10.0.0.1") == "1.2.3.4"


def test_responses_carry_security_headers():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "max-age" in response.headers["strict-transport-security"]


def test_log_safe_escapes_line_breaks_so_a_value_cannot_forge_log_lines():
    from app.security import log_safe

    forged = "TCS\nINFO fake: admin logged in\r\nWARNING x"
    out = log_safe(forged)
    assert "\n" not in out and "\r" not in out
    assert "TCS\\nINFO fake" in out


def test_log_safe_escapes_backslashes_and_caps_length():
    from app.security import log_safe

    assert log_safe("a\\nb") == "a\\\\nb"  # a literal backslash-n stays distinguishable from a real newline
    long = log_safe("x" * 1000, limit=50)
    assert long.startswith("x" * 50) and long.endswith("…") and len(long) == 51


def test_log_safe_accepts_non_strings():
    from app.security import log_safe

    assert log_safe(["A", "B\nC"]) == "['A', 'B\\\\nC']"
    assert log_safe(None) == "None"


class TestResolvePublicTarget:
    @staticmethod
    def _one(ip):
        calls = []

        def resolver(host):
            calls.append(host)
            return [ip]

        return resolver, calls

    def test_pins_the_connection_to_the_checked_ip_and_keeps_the_name(self):
        resolver, calls = self._one("93.184.216.34")
        target = security.resolve_public_target("https://example.com:8443/a/b.pdf?q=1#frag", resolve=resolver)
        assert target.request_url == "https://93.184.216.34:8443/a/b.pdf?q=1"
        assert target.host_header == "example.com:8443"
        assert target.sni_hostname == "example.com"
        assert calls == ["example.com"]  # resolved exactly once

    def test_plain_http_has_no_sni(self):
        resolver, _ = self._one("93.184.216.34")
        target = security.resolve_public_target("http://example.com/x", resolve=resolver)
        assert target.request_url == "http://93.184.216.34/x"
        assert target.sni_hostname is None

    def test_ipv6_answers_are_bracketed(self):
        resolver, _ = self._one("2606:2800:220:1:248:1893:25c8:1946")
        target = security.resolve_public_target("https://example.com/x", resolve=resolver)
        assert target.request_url == "https://[2606:2800:220:1:248:1893:25c8:1946]/x"

    def test_public_ip_literal_is_left_alone(self):
        target = security.resolve_public_target("http://93.184.216.34/x")
        assert target.request_url == "http://93.184.216.34/x"
        assert target.host_header == "93.184.216.34"

    def test_refuses_when_any_answer_is_internal(self):
        with pytest.raises(security.UnsafeUrlError):
            security.resolve_public_target("https://evil.example/x", resolve=lambda h: ["93.184.216.34", "10.0.0.5"])
