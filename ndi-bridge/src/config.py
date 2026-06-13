from pydantic_settings import BaseSettings


class BridgeConfig(BaseSettings):
    backend_url: str = "http://localhost:3001"
    source_prefix: str = "MCR-"
    max_streams: int = 8
    log_level: str = "INFO"
    reconnect_delay: int = 5  # seconds

    model_config = {"env_prefix": "NDI_"}
