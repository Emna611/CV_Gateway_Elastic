"""Pipelines d'inférence, un par scénario."""

from .kitchen import KitchenPipeline
from .office import OfficePipeline

PIPELINES = {"bureau": OfficePipeline, "cuisine": KitchenPipeline}
