"""Persisted, secret-free configuration shared by conversations and skills."""
from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class Service(Strict):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    name: str = Field(min_length=1,max_length=120)
    protocol: Literal['openai_compatible','ollama'] = 'openai_compatible'
    endpoint: str = Field(max_length=2000)
    auth: Literal['key','none'] = 'key'
    enabled: bool = True
    kind: Literal['厂商直连','聚合平台','模型平台','公司本地','自定义'] = '厂商直连'
    selfCert: bool = False
    apiKeyEnv: str | None = None  # Legacy reference only, never a credential value.

    @field_validator('endpoint')
    @classmethod
    def endpoint_valid(cls, value):
        parsed = urlsplit(value)
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('请输入不含凭据、查询参数的 http/https 服务地址')
        return value.rstrip('/')


class Calibration(Strict):
    at: str
    before: list[str] = Field(default_factory=list)
    after: list[str] = Field(default_factory=list)
    contextK: int | None = Field(default=None,gt=0)
    note: str = ''


class Model(Strict):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    serviceId: str
    identifier: str = Field(min_length=1,max_length=240)
    name: str = Field(min_length=1,max_length=160)
    enabled: bool = True
    capabilities: list[Literal['text','structured','tools','images','reasoning']] = Field(default_factory=lambda:['text'])
    orientation: Literal['质量优先','均衡','速度优先'] = '均衡'
    contextK: int | None = Field(default=None,gt=0)
    priceUnit: int = Field(default=1000,gt=0)
    inputPrice: float | None = Field(default=None,ge=0)
    outputPrice: float | None = Field(default=None,ge=0)
    currency: Literal['CNY','USD'] = 'CNY'
    lineage: str = Field(default='',max_length=2000)
    pricing: Literal['免费','免费额度','付费'] = '付费'
    registryTier: Literal['旗舰','均衡','快速','不指定'] | None = None
    registryCapabilities: list[str] | None = None
    providedCapabilities: list[str] | None = None
    capabilitySource: Literal['provider','calibrated','unknown'] = 'unknown'
    calibrations: list[Calibration] = Field(default_factory=list,max_length=1000)


class Defaults(Strict):
    general: str = ''
    chat: str = ''  # Empty is a live reference to general, not a copied model ID.
    skill: str = ''


class Failover(Strict):
    strategy: Literal['error','same','cross'] = 'error'
    retries: int = Field(default=1,ge=0,le=3)
    timeout: int = Field(default=60,ge=1)
    triggers: list[Literal['timeout','429','server']] = Field(default_factory=lambda:['timeout','429','server'])


class Catalog(Strict):
    services: list[Service] = Field(default_factory=list,max_length=100)
    models: list[Model] = Field(default_factory=list,max_length=1000)
    defaults: Defaults = Field(default_factory=Defaults)
    tiers: dict[str,str] = Field(default_factory=lambda:{'质量优先':'','均衡':'','速度优先':''})
    backups: dict[str,list[str]] = Field(default_factory=lambda:{'质量优先':[],'均衡':[],'速度优先':[]})
    failover: Failover = Field(default_factory=Failover)
    missingModels: dict[str,str] = Field(default_factory=dict)
    budget: float = Field(default=0,ge=0)
    budgetAlert: bool = True
