from abc import ABC, abstractmethod
from beivymate.runtime.context import AgentContext

# Base class for executable all agent skills. Each skill should implement the execute method, which defines the skill's behavior.
class Skill(ABC):
    # Execute the skill's behavior using the provided AgentContext. This method must be implemented by all subclasses. 
   @abstractmethod
   def execute(self, context: AgentContext) -> None:
       raise NotImplementedError
    