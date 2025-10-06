from django.urls    import path
from .              import views

urlpatterns = [
    # Venue listings and details
    path('', views.venue_list, name='venue_list'),                           # home / venue list - OK
    path('venue/<int:pk>/', views.venue_detail, name='venue_detail'),  # venue detail page - OK

    # Venue application and dashboard
    path('apply-venue/', views.apply_venue, name='apply_venue'),             # add a new venue to our app
    path('dashboard/<int:venue_id>/', views.venue_dashboard, name='venue_dashboard'), # An owner of a venue can browse the reservations of their venue(/s)

    # Venue status toggle
    path('toggle-full/<int:venue_id>/', views.toggle_venue_full, name='toggle_venue_full'),

    # Reservations (booking, cancelling, status update)
    path('book/<int:venue_id>/', views.make_reservation, name='book_venue'), # OK
    path('my-reservations/', views.my_reservations, name='my_reservations'), # OK
    
    path('reservation/<int:reservation_id>/cancel/',                                views.cancel_reservation,                   name='cancel_reservation'),
    path('reservation/<int:reservation_id>/status/<str:status>/',                   views.update_reservation_status,            name='update_reservation_status'),
    path('reservation/<int:reservation_id>/edit-status/',                           views.edit_reservation_status,              name='edit_reservation_status'),
    path('reservation/<int:reservation_id>/update-arrival/<str:arrival_status>/',   views.update_arrival_status,                name='update_arrival_status'),
    path('reservation/<int:reservation_id>/move-to-requests/',                      views.move_reservation_to_requests_ajax,    name='move_reservation_to_requests_ajax'),

    # Partials for AJAX/HTMX row replacement
    path('reservation-row/<int:pk>/',                                               views.partial_reservation_row,              name='partial_reservation_row'),
    path('arrival-row/<int:pk>/',                                                   views.partial_arrival_row,                  name='partial_arrival_row'),

    # Venue analytics / visits
    path('<int:venue_id>/analytics/partial/',                                       views.venue_visits_analytics_api,           name='venue_analytics_partial'),
    path("reservations/<int:pk>/edit/",                                             views.edit_reservation,                     name="edit_reservation"),
    
    path('venue/<int:venue_id>/update/',                                            views.submit_venue_update,                  name='submit_venue_update'),
]

