"""Entitlement and implemented capabilities are distinct from local identity.

M02 ships an unlimited full-feature trial. Future verified license loaders supply
an AccessPolicy; browser/Markdown input must never construct trusted grants.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class AccessPolicy:
    edition: str = 'trial'
    features: frozenset[str] = frozenset({'*'})
    expires_at: float | None = None

    def describe(self):
        return {'edition': self.edition, 'features': sorted(self.features), 'expiresAt': self.expires_at}

    def capabilities(self, now: float):
        # Account recovery and logout remain available after an entitlement expires.
        available = {'account.manage'}
        if self.expires_at is None or now < self.expires_at:
            implemented = {'workbench.read', 'credentials.manage'}
            available |= implemented if '*' in self.features else implemented & self.features
        return sorted(available)
