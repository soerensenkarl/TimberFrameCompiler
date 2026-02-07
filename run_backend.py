#!/usr/bin/env python3
"""Start the Timber Frame Generator API server."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "generator.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["generator"],
    )
