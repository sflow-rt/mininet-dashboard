$(function() { 
  var restPath =  '../scripts/metrics.js/';
  var dataURL = restPath + 'trend/json';
  var version = null;

  var nodes = new vis.DataSet([]);
  var edges = new vis.DataSet([]);

  var container = $('#vis-network')[0];
  var data = {nodes:nodes, edges:edges};
  var options = {
    interaction: { zoomView:false }
  };
  var network = new vis.Network(container, data, options);
  network.on('stabilized', function() {
    network.fit({animation:{duration:1000}});
  });

  function setNav(target) {
    $('.navbar .nav-item a[href="'+target+'"]').parent().addClass('active').siblings().removeClass('active');
    $(target).show().siblings().hide();
    window.sessionStorage.setItem('mininet_dashboard_nav',target);
    window.history.replaceState(null,'',target);
  }

  var hash = window.location.hash;
  if(hash && $('.navbar .nav-item a[href="'+hash+'"]').length == 1) setNav(hash);
  else setNav(window.sessionStorage.getItem('mininet_dashboard_nav') || $('.navbar .nav-item a').first().attr('href'));

  $('.navbar .nav-link').on('click', function(e) {
    var selected = $(this).attr('href');
    setNav(selected);
    if('#charts' === selected) $.event.trigger({type:'updateChart'});
    else if('#topology' === selected) network.fit();
  });

  $('a[href^="#"]').on('click', function(e) {
    e.preventDefault();
  });

  var db = {};
  $('#diameter').chart({
    type: 'trend',
    metrics: ['diameter'],
    stack:false,
    units: 'Diameter'},
  db);
  $('#topflows').chart({
    type: 'topn',
    stack: true,
    metric: 'top-5-flows',
    legendHeadings: ['Src Addr','Dst Addr','Proto','Src Prt','Dst Prt'],
    units: 'Bits per Second'},
  db);
  $('#links').chart({
    type: 'topn',
    stack: false,
    metric: 'top-5-interfaces',
    legendHeadings: ['Switch','Port'],
    units: 'Bits per Second'},
  db); 

  function updateTopology(top) {
    var node, edge, entry, ids, i;
    if(top.nodes) {
      for(node in top.nodes) {
        if(!nodes.get(node)) nodes.add({id:node,label:node}); 
      }
    }
    if(top.links) {
      for(edge in top.links) {
        entry = top.links[edge]; 
        if(!edges.get(edge)) edges.add({id:edge,from:entry.node1,to:entry.node2});
      }
    }
    ids = nodes.getIds();
    for(i = 0; i < ids.length; i++) {
      if(!top.nodes || !top.nodes[ids[i]]) nodes.remove({id:ids[i]});
    }
    ids = edges.getIds();
    for(i = 0; i < ids.length; i++) {
      if(!top.links || !top.links[ids[i]]) edges.remove({id:ids[i]});
    }
  }

  function updateNetwork(data) {
    var ids,i,links,width;

    if(!data || !data.topologyMetrics) return;

    if(data.topologyMetrics.version != version) {
      updateTopology(data.topologyMetrics);
      version = data.topologyMetrics.version;
    }
    links = data.topologyMetrics.links;
    if(links) {
      ids = edges.getIds();
      for(i = 0; i < ids.length; i++) {
        width = links[ids[i]] ? links[ids[i]].width : 1;
        edges.update({id:ids[i],width:width});
      }
    } 
  }

  function updateData(data) {
    updateNetwork(data);
    if(!data 
      || !data.trend 
      || !data.trend.times 
      || data.trend.times.length == 0) return;

    if(db.trend) {
      // merge in new data
      var maxPoints = db.trend.maxPoints;
      db.trend.times = db.trend.times.concat(data.trend.times);
      var remove = db.trend.times.length > maxPoints ? db.trend.times.length - maxPoints : 0;
      if(remove) db.trend.times = db.trend.times.slice(remove);
      for(var name in db.trend.trends) {
        db.trend.trends[name] = db.trend.trends[name].concat(data.trend.trends[name]);
        if(remove) db.trend.trends[name] = db.trend.trends[name].slice(remove);
      }
    } else db.trend = data.trend;

    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);

    $.event.trigger({type:'updateChart'});
  }

  $(window).resize(function() {
    $.event.trigger({type:'updateChart'});
    network.fit();
  });

  (function pollTrends() {
    $.ajax({
      url: dataURL,
      data: db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        updateData(data);
      },
      complete: function(result,status,errorThrown) {
        setTimeout(pollTrends,1000);
      },
      timeout: 60000
    });
  })();
});
