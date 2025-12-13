from django.urls    import path
from .              import views

urlpatterns = [
    # Venue listings and details
    path('',                                                                        views.venue_list,                           name='venue_list'), # home / venue list - OK
    path('venue/<int:pk>/',                                                         views.venue_detail,                         name='venue_detail'), # venue detail page - OK

    # Venue application and dashboard
    path('apply-venue/',                                                            views.apply_venue,                          name='apply_venue'), # add a new venue to our app
    path("verify-email/",                                                           views.verify_venue_email,                   name="verify_venue_email"),
    
    # AJAX endpoints
    path("ajax/send-venue-code/",                                                   views.ajax_send_venue_code,                 name="ajax_send_venue_code"),
    path("ajax/verify-venue-code/",                                                 views.ajax_verify_venue_code,               name="ajax_verify_venue_code"),


    path('dashboard/<int:venue_id>/',                                               views.venue_dashboard,                      name='venue_dashboard'), # An owner of a venue can browse the reservations of their venue(/s)

    # Venue status toggle
    path('toggle-full/<int:venue_id>/',                                             views.toggle_venue_full,                    name='toggle_venue_full'),

    # Reservations (booking, cancelling, status update)
    path('book/<int:venue_id>/',                                                    views.make_reservation,                     name='book_venue'),
    path('my-reservations/',                                                        views.my_reservations,                      name='my_reservations'),
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
    path("venue/<int:venue_id>/update-order/",                                      views.update_image_order,                   name="update_image_order"),
    path("venue/<int:venue_id>/update-menu-order/",                                 views.update_menu_image_order,              name="update_menu_image_order"),
]

