from django.urls import path
from venues import views


# Create your views here.
urlpatterns = [
    path('', views.venue_list, name='venue_list'),
    path('book/<int:venue_id>/', views.make_reservation, name='book_venue'),
    #path('venue/<int:venue_id>/reserve/', views.make_reservation, name='make_reservation'),
    path('my-reservations/', views.my_reservations, name='my_reservations'),
    path('reservation/<int:reservation_id>/cancel/', views.cancel_reservation, name='cancel_reservation'),

]
