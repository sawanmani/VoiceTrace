import sys
import os
import pytest
from fastapi.testclient import TestClient

# Add the project root to sys.path so we can import 'server' and 'detector'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

@pytest.fixture
def app_client():
    from server.main import app
    return TestClient(app)
