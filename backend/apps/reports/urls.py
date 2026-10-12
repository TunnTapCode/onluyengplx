from rest_framework.routers import DefaultRouter
from .views import QuestionReportViewSet

router = DefaultRouter()
router.register("questions", QuestionReportViewSet, basename="question-report")
urlpatterns = router.urls
