"""FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from generator.api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Timber Frame Generator",
        description="Rule-based generative timber framing engine",
        version="0.1.0",
    )

    # CORS — allow the Vite dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix="/api")

    return app


app = create_app()
