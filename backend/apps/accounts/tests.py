from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase


class AuthenticationTests(APITestCase):
    def test_register_and_jwt_login(self):
        response = self.client.post(reverse("register"), {
            "username": "newlearner",
            "email": "new@example.test",
            "password": "A-very-safe-password-2026!",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(get_user_model().objects.get(username="newlearner").check_password(
            "A-very-safe-password-2026!"
        ))
        response = self.client.post(reverse("token_obtain_pair"), {
            "username": "newlearner", "password": "A-very-safe-password-2026!",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("password", response.data)
