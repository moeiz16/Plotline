"""Plot assessment engine (official forest data + land-change signal -> EUDR verdict)."""

from app.assessment.engine import AssessmentResult, PlotInput, assess_plot, render_imagery, similar_plots

__all__ = ["AssessmentResult", "PlotInput", "assess_plot", "render_imagery", "similar_plots"]
