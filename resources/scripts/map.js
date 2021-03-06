var Handlebars = require('handlebars');
require('js-marker-clusterer');

(function($) {
    'use strict';

    Handlebars.registerHelper('googleApiKey', function() {
        return window.googleApiKey;
    });

    /**
     * Place class
     */
    var Place = function(data) {
        this.map = null;
        this.data = data;

        this.latlng = new google.maps.LatLng({
            lng: this.data.location.coordinates[0],
            lat: this.data.location.coordinates[1]
        });

        this.name = data.name;
        this.address = data.placeAddress;
        this.contact = data.phone;
        this.photos = data.photos;
        this.site = data.site;
        this.type = data.type || 'other';

        this._template = Handlebars.compile(this.templates.place);
        Handlebars.registerPartial('placeBodyWithPhotos', this.templates.placeBodyWithPhotos);
        Handlebars.registerPartial('placeBodyWithoutPhotos', this.templates.placeBodyWithoutPhotos);
        Handlebars.registerPartial('placePhotos', this.templates.placePhotos);
        Handlebars.registerPartial('placeDetails', this.templates.placeDetails);

        this.createTooltip();
        this.createMarker();

        Place.places.push(this);
    };

    Place.prototype.remove = function() {
        Place.places.slice(Place.places.indexOf(this), -1);
        this.marker.setMap(null);
    };

    Place.prototype.createMarker = function() {
        var self = this;

        this.marker = new google.maps.Marker({
            position: this.latlng, // data.location
            icon: 'images/marker-30.png'
        });
        this.marker.setVisible(false);

        this.marker.addListener('mouseover', function() {
            self.showTooltip();
        });

        this.marker.addListener('mouseout', function() {
            self.hideTooltip();
        });
    };

    Place.prototype.setMap = function(map) {
        this.map = map;
        this.marker.setMap(map.googleMap);
    };

    Place.prototype.createTooltip = function() {
        var data = $.extend({}, this);
        var html = this._template(data);
        this.$tooltip = $(html);
    };

    Place.prototype.showTooltip = function() {
        var offset = this.map.locationToOffset(this.latlng);
        this.$tooltip.css(offset).appendTo('body');

        // Initialize carousel
        this.$tooltip.find('.carousel')
            .find('.item:first').addClass('active').end()
            .carousel();

        // Handle mouseout
        var self = this;
        this.$tooltip.on('mouseout', function() {
            self.hideTooltip();
        });
    };

    Place.prototype.hideTooltip = function() {
        if (this.$tooltip.is(':hover')) return;
        this.$tooltip.remove();
    };

    Place.prototype.templates = {
        place: `
            <div class="place-tooltip">
                {{#if photos}}
                    {{> placeBodyWithPhotos}}
                {{else}}
                    {{> placeBodyWithoutPhotos}}
                {{/if}}
            </div>
        `,
        placeBodyWithPhotos: `
            <div class="row">
                <div class="col-md-6">
                    {{> placePhotos}}
                </div>
                <div class="col-md-6">
                    {{> placeDetails}}
                </div>
            </div>
        `,
        placeBodyWithoutPhotos: `
            {{> placeDetails}}
        `,
        placeDetails: `
            <h4>{{name}}</h4>
            <p class="address">{{address}}</p>
            <p class="contact">{{contact}}</p>
            <p class="site">{{site}}</p>
        `,
        placePhotos: `
            <div class="carousel slide">
                <!-- Wrapper for slides -->
                <div class="carousel-inner" role="listbox">
                    {{#each photos}}
                        <div class="item">
                            <img class="img-responsive img-circle" width="200"
                                src="https://maps.googleapis.com/maps/api/place/photo?key={{googleApiKey}}&maxwidth=200&photoreference={{this}}" />
                        </div>
                    {{/each}}
                </div>
            </div>
        `
    };

    Place.prototype.isVisible = function() {
        return this.marker.getVisible() == true;
    };

    Place.prototype.hide = function() {
        this.marker.setVisible(false);
    };

    Place.prototype.show = function() {
        this.marker.setVisible(true);
    };

    Place.places = [];

    Place.purge = function() {
        $.each(Place.places, function(n, place) {
            place.remove();
        });
    };

    /**
     * Map class
     */
    var Map = function(element) {
        this.element = element;

        // Data with places
        this.data = [];

        // Marker clusterer
        this.cluster = null;

        this.settings = $.extend({}, Map.defaults);

        this.init();
    };

    Map.defaults = {
        center: {lat: 51.8464397, lng: 19.6254585},
        zoom: 6,
        filterTypes: false
    };

    Map.prototype.init = function() {
        this.googleMap = new google.maps.Map(this.element, {
            center: this.settings.center,
            zoom: this.settings.zoom,
            styles: [].concat(this.styles).concat([{
                featureType: 'poi',
                stylers: [
                    { visibility: 'off' }
                ]
            }]),
            disableDefaultUI: true,
            zoomControl: true,
            scaleControl: true
        });

        var self = this;
        google.maps.event.addListenerOnce(this.googleMap, 'idle', function(){
            self.setCenter(self.googleMap.getCenter(), false);
        });

        this.cluster = new MarkerClusterer(this.googleMap, [], this.clusterOptions);

        this.findAll();
    };

    Map.prototype.geocode = function(q, callback) {
        var geocoder = new google.maps.Geocoder();

        geocoder.geocode({
            address: q
        }, function(results, status) {
            if (status === google.maps.GeocoderStatus.OK) {
                callback(results[0]);
            } else {
                window.alert('Geocode was not successful for the following reason: ' + status);
            }
        });
    };

    Map.prototype.setFilterTypes = function(types) {
        if (this.settings.filterTypes !== types) {
            this.settings.filterTypes = types;
            this.draw();
        }
    };

    Map.prototype.search = function(q) {
        var self = this;

        Place.purge();

        // Geocode location
        this.geocode(q, function(result) {
            self.googleMap.fitBounds(result.geometry.bounds);
            self.setCenter(result.geometry.location);
        });
    };

    Map.prototype.findAll = function() {
        var self = this;

        Place.purge();

        $.ajax('/places/list', {
            success: function(data) {
                var markers = [];
                $.each(data, function(n, placeData) {
                    var place = new Place(placeData);
                    place.setMap(self);
                    markers.push(place.marker);
                });

                self.draw();
            }
        });
    };

    Map.prototype.draw = function() {
        var self = this;

        $.each(Place.places, function(n, place) {
            if (self.settings.filterTypes !== false && !self.settings.filterTypes.includes(place.type)) {
                if (place.isVisible()) {
                    place.hide();
                    self.cluster.removeMarker(place.marker, true);
                }
            } else {
                if (!place.isVisible()) {
                    place.show();
                    self.cluster.addMarker(place.marker, true);
                }
            }
        });

        this.cluster.resetViewport();
        this.cluster.redraw();
    }

    /**
     * Convert GMap LatLng to container offset
     *
     * @see http://stackoverflow.com/questions/2674392/how-to-access-google-maps-api-v3-markers-div-and-its-pixel-position
     */
    Map.prototype.locationToOffset = function(latlng) {
        var map = this.googleMap;
        var scale = Math.pow(2, map.getZoom());

        var nw = new google.maps.LatLng(
            map.getBounds().getNorthEast().lat(),
            map.getBounds().getSouthWest().lng()
        );

        var worldCoordinateNW = map.getProjection().fromLatLngToPoint(nw);
        var worldCoordinate = map.getProjection().fromLatLngToPoint(latlng);

        return {
            left: Math.floor((worldCoordinate.x - worldCoordinateNW.x) * scale),
            top: Math.floor((worldCoordinate.y - worldCoordinateNW.y) * scale)
        };
    };

    /**
     * @see http://stackoverflow.com/questions/9577034/google-maps-scroll-map-programmatically-of-x-pixels
     */
    Map.prototype.transformLatLng = function(latlng, offset) {
        var projection = this.googleMap.getProjection();
        var scale = Math.pow(2, this.googleMap.getZoom());

        var point = projection.fromLatLngToPoint(latlng);
        point.x += offset.x / scale;
        point.y += offset.y / scale;

        return projection.fromPointToLatLng(point);
    };

    Map.prototype.setCenter = function(location, pan) {
        var center = location;

        center = this.transformLatLng(
            center,
            { x: -0.5 * ($('#page-nav').offset().left +  $('#page-nav').outerWidth()), y: 0 }
        );

        this.googleMap[pan === false ? 'setCenter' : 'panTo'](center);
    };

    Map.prototype.setZoom = function(zoom) {
        this.googleMap.setZoom(zoom);
    };

    Map.prototype.styles = JSON.parse(
        '[{"featureType":"administrative","elementType":"all","stylers":[{"visibility":"off"}]},' +
        '{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"visibility' +
        '":"on"}]},{"featureType":"administrative","elementType":"labels","stylers":[{"visibilit' +
        'y":"on"},{"color":"#716464"},{"weight":"0.01"}]},{"featureType":"administrative.country' +
        '","elementType":"labels","stylers":[{"visibility":"on"}]},{"featureType":"landscape","e' +
        'lementType":"all","stylers":[{"visibility":"simplified"}]},{"featureType":"landscape.na' +
        'tural","elementType":"geometry","stylers":[{"visibility":"simplified"}]},{"featureType"' +
        ':"landscape.natural.landcover","elementType":"geometry","stylers":[{"visibility":"simpl' +
        'ified"}]},{"featureType":"poi","elementType":"all","stylers":[{"visibility":"simplified' +
        '"}]},{"featureType":"poi","elementType":"geometry.fill","stylers":[{"visibility":"simpl' +
        'ified"}]},{"featureType":"poi","elementType":"geometry.stroke","stylers":[{"visibility"' +
        ':"simplified"}]},{"featureType":"poi","elementType":"labels.text","stylers":[{"visibili' +
        'ty":"simplified"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"' +
        'visibility":"simplified"}]},{"featureType":"poi","elementType":"labels.text.stroke","st' +
        'ylers":[{"visibility":"simplified"}]},{"featureType":"poi.attraction","elementType":"ge' +
        'ometry","stylers":[{"visibility":"on"}]},{"featureType":"road","elementType":"all","sty' +
        'lers":[{"visibility":"on"}]},{"featureType":"road.highway","elementType":"all","stylers' +
        '":[{"visibility":"off"}]},{"featureType":"road.highway","elementType":"geometry","style' +
        'rs":[{"visibility":"on"}]},{"featureType":"road.highway","elementType":"geometry.fill",' +
        '"stylers":[{"visibility":"on"}]},{"featureType":"road.highway","elementType":"geometry.' +
        'stroke","stylers":[{"visibility":"simplified"},{"color":"#a05519"},{"saturation":"-13"}' +
        ']},{"featureType":"road.local","elementType":"all","stylers":[{"visibility":"on"}]},{"f' +
        'eatureType":"transit","elementType":"all","stylers":[{"visibility":"simplified"}]},{"fe' +
        'atureType":"transit","elementType":"geometry","stylers":[{"visibility":"simplified"}]},' +
        '{"featureType":"transit.station","elementType":"geometry","stylers":[{"visibility":"on"' +
        '}]},{"featureType":"water","elementType":"all","stylers":[{"visibility":"simplified"},{' +
        '"color":"#84afa3"},{"lightness":52}]},{"featureType":"water","elementType":"geometry","' +
        'stylers":[{"visibility":"on"}]},{"featureType":"water","elementType":"geometry.fill","s' +
        'tylers":[{"visibility":"on"}]}]');

    Map.prototype.clusterOptions = {
        maxZoom: 12,
        zoomOnClick: true,
        averageCenter: true,
        styles: [
            {
                url: '../images/marker-40.png',
                height: 40,
                width: 28,
                textColor: 'transparent',
                iconAnchor: [14, 37],
                backgroundPosition: 'center bottom'
            },
            {
                url: '../images/marker-50.png',
                height: 50,
                width: 35,
                textColor: 'transparent',
                iconAnchor: [17.5, 47],
                backgroundPosition: 'center bottom'
            },
            {
                url: '../images/marker-60.png',
                height: 60,
                width: 42,
                textColor: 'transparent',
                iconAnchor: [21, 57],
                backgroundPosition: 'center bottom'
            }
        ]
    };

    window.Map = Map;
})(jQuery);
