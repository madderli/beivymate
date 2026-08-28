from beivymate.runtime.skill import Skill

# Register the avalible skills.
class SkillRegistry:

    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}

    def register(
        self,
        skill_id: str,
        skill: Skill,
    ) -> None:
        if skill_id in self._skills:
            raise ValueError(
                f"Skill already registered: {skill_id}"
            )

        self._skills[skill_id] = skill

    def get(self, skill_id: str) -> Skill:
        try:
            return self._skills[skill_id]
        except KeyError as exc:
            raise KeyError(
                f"Skill not found: {skill_id}"
            ) from exc

    def contains(self, skill_id: str) -> bool:
        return skill_id in self._skills

    def resolve(
        self,
        skill_ids: list[str],
    ) -> list[Skill]:
        return [
            self.get(skill_id)
            for skill_id in skill_ids
        ]