from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.question_bank.views import (
    CategoryViewSet,
    LicenseClassViewSet,
    QuestionViewSet,
)
from apps.study.views import BookmarkViewSet, StudyViewSet
from apps.exams.views import ExamConfigurationViewSet, ExamSessionViewSet

router = DefaultRouter()
router.register("license-classes", LicenseClassViewSet, basename="license-class")
router.register("categories", CategoryViewSet, basename="category")
router.register("questions", QuestionViewSet, basename="question")
router.register("bookmarks", BookmarkViewSet, basename="bookmark")
router.register("study", StudyViewSet, basename="study")
router.register("exams/configurations", ExamConfigurationViewSet, basename="exam-configuration")
router.register("exams/sessions", ExamSessionViewSet, basename="exam-session")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include(router.urls)),
    path("api/v1/", include("apps.reports.urls")),
    path("api/v1/exams/", include("apps.exams.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
