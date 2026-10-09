# Earlier test scaffolding

Preserved from the original backend directory. These files are not part of the
active Django test suite: the authentication example uses an outdated login
contract and the remaining empty files are placeholders. No package markers
are provided, so Django unittest discovery does not collect this directory.
The old Table model/API test files were deleted at the user's request.

Run the active tests from backend with:
`python manage.py test accounts venues emails_manager tests --settings=openspots.settings_test`.
