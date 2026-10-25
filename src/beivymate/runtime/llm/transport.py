import json
import ssl

import certifi
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
            proxy_handler = request.ProxyHandler()

        handlers = [proxy_handler]
        if config.self_signed:
            context = ssl._create_unverified_context()
        else:
            context = ssl.create_default_context()
            # Keep OS/custom roots and supplement missing Python installation CAs.
            context.load_verify_locations(cafile=certifi.where())
        handlers.append(request.HTTPSHandler(context=context))
        self._opener = request.build_opener(*handlers)

    def get_json(self, url, headers=None):
        req = request.Request(url, headers=headers or {}, method='GET')
        try:
            with self._opener.open(req, timeout=self.config.timeout) as response:
                return json.loads(response.read(5 * 1024 * 1024).decode('utf-8'))
        except HTTPError as exc:
            messages = {
                400: "厂商未接受连接信息，请检查服务地址和鉴权方式。",
                401: "API Key 无效或已失效，请检查是否填写完整，或重新生成后重试。",
                403: "当前账号没有访问模型目录的权限，或服务限制了当前网络地区，请检查账号权限和网络。",
                404: "未找到模型目录，请检查 Base URL 是否为厂商提供的 API 地址；该服务也可能不支持自动发现，可手动添加模型。",
                407: "当前网络代理需要登录，请先完成代理认证后重试。",
                408: "厂商响应超时，请稍后重试。",
                429: "请求过于频繁，或账号额度受限，请稍后重试并检查厂商账户额度。",
            }
            message = messages.get(exc.code)
            if message is None:
                message = ("厂商服务暂时不可用，请稍后重试。" if exc.code >= 500
                           else "厂商未能提供模型目录，请检查服务地址和账号设置，或手动添加模型。")
            raise RuntimeError(message) from None
        except TimeoutError:
            raise RuntimeError("读取模型目录超时（30 秒），请检查网络或系统代理后重试；也可以手动添加模型。") from None
        except URLError as exc:
            if isinstance(exc.reason, ssl.SSLCertVerificationError):
                raise RuntimeError("模型服务证书校验失败，请检查本机受信任证书及代理证书配置。") from None
            if isinstance(exc.reason, TimeoutError):
                raise RuntimeError("读取模型目录超时（30 秒），请检查网络或系统代理后重试。") from None
            raise RuntimeError("无法连接模型目录，请检查 Base URL、网络及系统代理设置。") from None
        except ValueError:
            raise RuntimeError('服务返回的内容不是可识别的模型目录，请检查 Base URL 是否为 API 地址，而非网页地址；也可以手动添加模型。') from None

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