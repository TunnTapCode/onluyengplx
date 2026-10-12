from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema

from .serializers import (
    LogoutSerializer,
    PasswordChangeSerializer,
    ProfileSerializer,
    RegisterSerializer,
)


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    serializer_class = PasswordChangeSerializer

    @extend_schema(request=PasswordChangeSerializer, responses={200: None})
    def post(self, request):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password changed."}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    serializer_class = LogoutSerializer

    @extend_schema(request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh"]
        try:
            token = RefreshToken(refresh)
            if str(token["user_id"]) != str(request.user.pk):
                return Response({"detail": "Invalid token owner."}, status=400)
            token.blacklist()
        except Exception:
            return Response({"detail": "Invalid refresh token."}, status=400)
        return Response(status=status.HTTP_205_RESET_CONTENT)
