import sys
import pathlib

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

_DEFAULT_CONFIG = {
    "hotkey": {"key": "f9"},
    "capture": {"offset_x": -220, "offset_y": -160, "width": 440, "height": 140},
    "backend": {"url": "http://localhost:3001"},
}

_config_path = pathlib.Path(__file__).parent / "config.toml"


def load() -> dict:
    if not _config_path.exists():
        return _DEFAULT_CONFIG

    with _config_path.open("rb") as f:
        user = tomllib.load(f)

    merged = {**_DEFAULT_CONFIG}
    for section, values in user.items():
        merged[section] = {**_DEFAULT_CONFIG.get(section, {}), **values}
    return merged
