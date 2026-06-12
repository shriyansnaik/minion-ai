from openai import OpenAI
from .config import get_config


def get_client() -> OpenAI:
    config = get_config()

    if not config.api_key:
        raise RuntimeError(
            "No API key set. Call minions.init(api_key='...') before using Minion."
        )

    return OpenAI(
        api_key=config.api_key,
        base_url=config.base_url,
    )
