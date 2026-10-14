-- Reference seed. Contains NO outage data. Sources are created DISABLED with no URL:
-- an operator must supply the URL and record why use is permitted before enabling.

insert into areas (name, kind, ward, region, lat, lng) values
 ('Witfield','suburb',22,'Boksburg',-26.2297,28.2603),
 ('Boksburg','suburb',null,'Boksburg',-26.2125,28.2625),
 ('Boksburg North','suburb',null,'Boksburg',-26.18,28.25),
 ('Parkdene','suburb',null,'Boksburg',-26.2406,28.2339),
 ('Impala Park','suburb',null,'Boksburg',-26.2336,28.2186),
 ('Reiger Park','suburb',null,'Boksburg',-26.2386,28.2503),
 ('Vosloorus','suburb',null,'Boksburg',-26.355,28.2),
 ('Benoni','suburb',null,'Benoni',-26.1885,28.3208),
 ('Northmead','suburb',null,'Benoni',-26.1696,28.3187),
 ('Brakpan','suburb',null,'Brakpan',-26.236,28.369),
 ('Springs','suburb',null,'Springs',-26.25,28.4),
 ('Germiston','suburb',null,'Germiston',-26.2309,28.167),
 ('Edenvale','suburb',null,'Edenvale',-26.1411,28.1522),
 ('Kempton Park','suburb',null,'Kempton Park',-26.1,28.23),
 ('Tembisa','suburb',null,'Tembisa',-25.996,28.226),
 ('Alberton','suburb',null,'Alberton',-26.269,28.122),
 ('Katlehong','suburb',null,'Katlehong',-26.34,28.15)
on conflict do nothing;

insert into sources (id, name, adapter, kind, url, verified_publisher, terms_note, enabled, interval_minutes) values
 ('ekurhuleni-notices','Ekurhuleni Municipality – service notices','rss','municipal_notice',null,true,
  'TODO operator: add the official RSS/Atom feed URL (or JSON endpoint) published by ekurhuleni.gov.za and confirm its terms permit automated retrieval.',false,15),
 ('ekurhuleni-electricity-x','Ekurhuleni electricity dept – X (verified account)','x','municipal_social',null,true,
  'Official X API v2 only (bearer token). config.username = the verified municipal handle. Do not scrape.',false,10),
 ('eskom-notices','Eskom – Gauteng outage notices','rss','eskom',null,true,
  'TODO operator: add an Eskom-published feed/API URL that permits automated access (Eskom supplies parts of Ekurhuleni directly).',false,15),
 ('public-outage-service','Public outage-reporting service (JSON)','json','public_service',null,false,
  'Only enable with a provider API and key/licence that permits redistribution. Results show as UNVERIFIED.',false,15)
on conflict do nothing;
