from beivymate.agent.tester.agent import TesterAgent


class AgentFactory:

    def __init__(
        self,
        tester_agent: TesterAgent,
    ) -> None:

        self._agents = {
            "tester": tester_agent,
        }

    def create(self, role: str):
        try:
            return self._agents[role]

        except KeyError as exc:
            raise ValueError(
                f"Unsupported agent role: {role}"
            ) from exc