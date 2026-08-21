import json
from urllib import request
from urllib.error import HTTPError, URLError

from .models import LLMConnectionConfig


class HTTPTransport:
    """HTTP transport used by LLM providers."""

    def __init__(self, config: LLMConnectionConfig):
        self.config = config

        if config.proxy:
            proxy_handler = request.ProxyHandler(
                {
                    "http": config.proxy,
                    "https": config.proxy,
                }
            )
        else:
            proxy_handler = request.ProxyHandler({})

        self._opener = request.build_opener(
            proxy_handler
        )

    def post_json(
        self,
        url: str,
        payload: dict,
        headers: dict[str, str] | None = None,
    ) -> dict:

        data = json.dumps(payload).encode("utf-8")

        http_request = request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                **(headers or {}),
            },
            method="POST",
        )

        try:
            with self._opener.open(
                http_request,
                timeout=self.config.timeout,
            ) as response:

                return json.loads(
                    response.read().decode("utf-8")
                )

        except HTTPError as exc:
            error_body = exc.read().decode(
                "utf-8",
                errors="replace",
            )

            raise RuntimeError(
                f"LLM HTTP request failed: "
                f"status={exc.code}, "
                f"url={url}, "
                f"body={error_body}"
            ) from exc

        except URLError as exc:
            raise RuntimeError(
                f"Unable to connect to LLM service: "
                f"url={url}, "
                f"reason={exc.reason}"
            ) from exc