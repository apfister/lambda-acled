## AWS Lambda ACLED
This is a AWS lambda function in Node.js meant to grab data from the [Armed Conflict Location & Event Data Project](http://www.acleddata.com/data/realtime-data). It will query the [ACLED API](http://www.acleddata.com/wp-content/uploads/2013/12/API-User-Guide-August-2017.pdf) for data from the past 2 weeks and then add it into a "Live" version of an ArcGIS Feature Service

For making updates to Historic ACLED Data, you can reference [this repo](https://github.com/apfister/acled-historic-python-nb), which utilizes a Jupyter Notebook.
