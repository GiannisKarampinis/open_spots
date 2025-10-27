from django.urls            import path
from django.contrib.auth    import views as auth_views
from accounts               import views
from .views                 import CustomLoginView
from .                      import api_views

urlpatterns = [
    path('login/',                  CustomLoginView.as_view(),                          name='login'),
    path('signup/',                 views.signup_view,                                  name='signup'),
    path('profile/',                views.profile_view,                                 name='profile'),
    path('logout/',                 auth_views.LogoutView.as_view(next_page='login'),   name='logout'),
    path('administration_panel/',   views.administration_panel,                         name='administration_panel'),
    path('resend-code/',            views.resend_code_view,                             name='resend_code'),
    path('password-recover/',       views.password_recover_request,                     name='password_recover'),
    path('reset-password/',         views.password_reset,                               name='password_reset'),
    
    # API endpoint
    path("api/profile/",            api_views.profile_api,                              name="profile_api"),
    path('confirm-code/',           views.confirm_code_view,                            name='confirm_code'),
    
    # path('reservation/<int:reservation_id>/update-status/', views.update_reservation_status, name='update_reservation_status'),
    # path('verify-email/<uidb64>/<token>/', views.verify_email, name='verify_email'),
]