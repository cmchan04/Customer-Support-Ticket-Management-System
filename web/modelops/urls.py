from django.urls import path

from .views import activate_deployment, deployments, operational, predict

urlpatterns = [
    path("deployments/", deployments, name="model-deployments"),
    path("deployments/<str:family>/operational/", operational, name="model-operational"),
    path("deployments/<str:family>/activate/", activate_deployment, name="model-activate"),
    path("predict/", predict, name="model-predict"),
]
