# Design: NGSI-LD data models catalog (moved)

This design document moved to the catalog's own repository when the catalog became product-neutral and moved from `models.geonicdb.com` to **https://datamodels.jp** (decided 2026-09-18):

- Design document: https://github.com/geolonia/datamodels/blob/main/docs/design.md
- Launch plan: https://github.com/geolonia/datamodels/issues/30

GeonicDB integrates with the catalog as one broker among others: the catalog publishes GeonicDB Custom Data Model definitions through its GeonicDB adapter under `https://datamodels.jp/adapters/geonicdb/`, and GeonicDB can read `https://datamodels.jp/catalog.json`. The history of this file (2026-09-17 to 2026-09-24) remains in this repository's Git history.
